import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, Service, signal, TransferState } from '@angular/core';
import * as v from 'valibot';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import {
  HomeHeroSchema,
  HomeNavListSchema,
  HomeSettingsSchema,
  HomeShopCategoriesSchema,
} from '../schemas/home.schema';
import { HOME_SETTINGS_KEY, HomeSettingsSeed, toHomeSettingsSeed } from '../resolvers/home-settings.state';
import { HomeHero, HomeNavList, HomeSettings, HomeShopCategories } from '../models/home.model';
import { DEFAULT_HOME_HERO, DEFAULT_HOME_NAV_LIST, DEFAULT_HOME_SHOP_CATEGORIES } from '../data/home.data';
import {
  heroWithoutDeleted,
  navListWithoutDeleted,
  shopCardsWithoutDeleted,
} from '../utils/home-defaults.utils';
import { CatalogService } from '@core/services/products/catalog.service';

const HERO_STORAGE_KEY = 'atteya_store_home_hero';
const SHOP_CATEGORIES_STORAGE_KEY = 'atteya_store_home_shop_categories';
const NAV_LIST_STORAGE_KEY = 'atteya_store_home_nav_list';

/**
 * A saved Previous Versions copy of `settings/home` (ATS-251) through today's schema, with the
 * built-in sections standing in for missing ones; null when it no longer fits.
 */
export function homeSettingsFromVersion(data: unknown): HomeSettingsUpdate | null {
  const parsed = v.safeParse(HomeSettingsSchema, data);
  if (!parsed.success) return null;
  return {
    hero: parsed.output.hero,
    shopCategories: parsed.output.shopCategories ?? DEFAULT_HOME_SHOP_CATEGORIES,
    navList: parsed.output.navList ?? DEFAULT_HOME_NAV_LIST,
  };
}

export interface HomeSettingsUpdate {
  readonly hero: HomeHero;
  readonly shopCategories: HomeShopCategories;
  readonly navList: HomeNavList;
}

/**
 * Reads one saved copy and checks it against its schema. A copy that is
 * missing, unreadable or no longer matches is dropped (and removed), so an
 * old or broken copy never reaches the page.
 */
function readStored<TSchema extends v.GenericSchema>(
  key: string,
  schema: TSchema,
): v.InferOutput<TSchema> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const result = v.safeParse(schema, JSON.parse(raw));
    if (result.success) return result.output;
  } catch {
    // Unreadable copy: fall through and remove it.
  }
  removeStored(key);
  return null;
}

function persistStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or blocked storage.
  }
}

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/**
 * Saves the sections the live document has, for the next visit, and drops a
 * saved section the document no longer has (the built-in one is right then).
 */
function persistStoredSettings(settings: HomeSettingsSeed | null): void {
  if (settings) persistStored(HERO_STORAGE_KEY, settings.hero);
  else removeStored(HERO_STORAGE_KEY);
  if (settings?.shopCategories) persistStored(SHOP_CATEGORIES_STORAGE_KEY, settings.shopCategories);
  else removeStored(SHOP_CATEGORIES_STORAGE_KEY);
  if (settings?.navList) persistStored(NAV_LIST_STORAGE_KEY, settings.navList);
  else removeStored(NAV_LIST_STORAGE_KEY);
}

/** How long a client navigation to `/` waits for settings/home before showing the built-in sections. */
const FIRST_SNAPSHOT_WAIT_MS = 3000;

@Service()
export class HomeService {
  readonly #firestore = injectFirestore();

  readonly #homeDocRef = doc(this.#firestore, 'settings', 'home').withConverter(
    createValibotConverter(HomeSettingsSchema),
  );

  readonly #transfer = inject(TransferState);
  readonly #destroyRef = inject(DestroyRef);
  readonly #catalog = inject(CatalogService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** undefined while the first browser snapshot is still outstanding. */
  readonly #homeDoc = signal<HomeSettingsSeed | null | undefined>(undefined);

  /**
   * Copies saved on an earlier visit, read and checked once in the browser.
   * Left empty when the server sent its own seed (even an empty one), so
   * hydration always matches the server HTML.
   */
  #storedHero: HomeHero | null = null;
  #storedShopCategories: HomeShopCategories | null = null;
  #storedNavList: HomeNavList | null = null;

  #markFirstAnswer: () => void = () => undefined;
  readonly #firstAnswer = new Promise<void>((resolve) => (this.#markFirstAnswer = resolve));

  constructor() {
    if (this.#transfer.hasKey(HOME_SETTINGS_KEY)) {
      this.#homeDoc.set(this.#transfer.get(HOME_SETTINGS_KEY, null));
      // Leave the key on the server so it is written into the HTML.
      if (this.#isBrowser) this.#transfer.remove(HOME_SETTINGS_KEY);
    } else if (!this.#isBrowser) {
      this.#homeDoc.set(null);
    } else {
      this.#storedHero = readStored(HERO_STORAGE_KEY, HomeHeroSchema);
      this.#storedShopCategories = readStored(SHOP_CATEGORIES_STORAGE_KEY, HomeShopCategoriesSchema);
      this.#storedNavList = readStored(NAV_LIST_STORAGE_KEY, HomeNavListSchema);
    }

    if (!this.#isBrowser) return;

    const unsubscribe = onSnapshot(
      this.#homeDocRef,
      (snapshot) => {
        const seed = snapshot.exists() ? toHomeSettingsSeed(snapshot.data()) : null;
        persistStoredSettings(seed);
        this.#homeDoc.set(seed);
        this.#markFirstAnswer();
      },
      () => {
        this.#homeDoc.set(null);
        this.#markFirstAnswer();
      },
    );
    this.#destroyRef.onDestroy(unsubscribe);
  }

  /**
   * Resolves once the home page has something real to show: the server seed,
   * a saved copy from an earlier visit, or the first live answer. Gives up
   * after a few seconds, so a slow connection still opens the page (with the
   * built-in sections) instead of hanging on the old one.
   */
  whenReady(): Promise<void> {
    if (this.#homeDoc() !== undefined || this.#storedHero) return Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => (timer = setTimeout(resolve, FIRST_SNAPSHOT_WAIT_MS)));
    return Promise.race([this.#firstAnswer, timeout]).finally(() => clearTimeout(timer));
  }

  /**
   * Indicates whether the live home settings document is loading.
   */
  readonly isLoading = computed<boolean>(() => this.#homeDoc() === undefined);

  /**
   * Live hero from Firestore; falls back to the saved copy, then DEFAULT_HOME_HERO.
   */
  readonly hero = computed<HomeHero>(
    () =>
      this.#homeDoc()?.hero ??
      this.#storedHero ??
      heroWithoutDeleted(DEFAULT_HOME_HERO, this.#catalog.deletedBuiltInIds()),
  );

  /**
   * Live Section 2 (Shop Categories) from Firestore; falls back to the saved
   * copy, then DEFAULT_HOME_SHOP_CATEGORIES.
   */
  readonly shopCategories = computed<HomeShopCategories>(
    () =>
      this.#homeDoc()?.shopCategories ??
      this.#storedShopCategories ??
      shopCardsWithoutDeleted(DEFAULT_HOME_SHOP_CATEGORIES, this.#catalog.deletedBuiltInIds()),
  );

  /**
   * Live Section 3 (category list) from Firestore. A settings/home document
   * without navList falls through to the saved list, then DEFAULT_HOME_NAV_LIST.
   */
  readonly navList = computed<HomeNavList>(
    () =>
      this.#homeDoc()?.navList ??
      this.#storedNavList ??
      navListWithoutDeleted(DEFAULT_HOME_NAV_LIST, this.#catalog.deletedBuiltInIds()),
  );

  /**
   * Publishes the homepage hero, shop cards, and category list together. `updatedBy` (the saver's
   * uid) goes on the doc so Previous Versions can say who saved each version (ATS-251).
   */
  async updateHomeSettings(settings: HomeSettingsUpdate, updatedBy: string): Promise<void> {
    const payload: HomeSettings = {
      id: 'home',
      hero: settings.hero,
      shopCategories: settings.shopCategories,
      navList: settings.navList,
      updatedAt: serverTimestamp(),
      updatedBy,
    };
    await setDoc(this.#homeDocRef, payload, { merge: true });
  }

  /**
   * Resets all home page sections to factory defaults.
   */
  async resetDefaultHomeSettings(updatedBy: string): Promise<void> {
    await this.updateHomeSettings(
      {
        hero: DEFAULT_HOME_HERO,
        shopCategories: DEFAULT_HOME_SHOP_CATEGORIES,
        navList: DEFAULT_HOME_NAV_LIST,
      },
      updatedBy,
    );
  }
}
