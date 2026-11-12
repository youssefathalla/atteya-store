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

const HERO_STORAGE_KEY = 'atteya_store_home_hero';
const SHOP_CATEGORIES_STORAGE_KEY = 'atteya_store_home_shop_categories';
const NAV_LIST_STORAGE_KEY = 'atteya_store_home_nav_list';

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
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
  }
  return null;
}

function persistStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or blocked storage.
  }
}

/** Saves the sections the live document has, for the next visit. */
function persistStoredSettings(settings: HomeSettingsSeed): void {
  persistStored(HERO_STORAGE_KEY, settings.hero);
  if (settings.shopCategories) persistStored(SHOP_CATEGORIES_STORAGE_KEY, settings.shopCategories);
  if (settings.navList) persistStored(NAV_LIST_STORAGE_KEY, settings.navList);
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
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** undefined while the first browser snapshot is still outstanding. */
  readonly #homeDoc = signal<HomeSettingsSeed | null | undefined>(undefined);

  /** Copies saved on an earlier visit, read and checked once in the browser. */
  readonly #storedHero: HomeHero | null = this.#isBrowser
    ? readStored(HERO_STORAGE_KEY, HomeHeroSchema)
    : null;
  readonly #storedShopCategories: HomeShopCategories | null = this.#isBrowser
    ? readStored(SHOP_CATEGORIES_STORAGE_KEY, HomeShopCategoriesSchema)
    : null;
  readonly #storedNavList: HomeNavList | null = this.#isBrowser
    ? readStored(NAV_LIST_STORAGE_KEY, HomeNavListSchema)
    : null;

  #markFirstAnswer: () => void = () => undefined;
  readonly #firstAnswer = new Promise<void>((resolve) => (this.#markFirstAnswer = resolve));

  constructor() {
    if (this.#transfer.hasKey(HOME_SETTINGS_KEY)) {
      this.#homeDoc.set(this.#transfer.get(HOME_SETTINGS_KEY, null));
      // Leave the key on the server so it is written into the HTML.
      if (this.#isBrowser) this.#transfer.remove(HOME_SETTINGS_KEY);
    } else if (!this.#isBrowser) {
      this.#homeDoc.set(null);
    }

    if (!this.#isBrowser) return;

    const unsubscribe = onSnapshot(
      this.#homeDocRef,
      (snapshot) => {
        const seed = snapshot.exists() ? toHomeSettingsSeed(snapshot.data()) : null;
        if (seed) persistStoredSettings(seed);
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
    return Promise.race([
      this.#firstAnswer,
      new Promise<void>((resolve) => setTimeout(resolve, FIRST_SNAPSHOT_WAIT_MS)),
    ]);
  }

  /**
   * Indicates whether the live home settings document is loading.
   */
  readonly isLoading = computed<boolean>(() => this.#homeDoc() === undefined);

  /**
   * Live hero from Firestore; falls back to the saved copy, then DEFAULT_HOME_HERO.
   */
  readonly hero = computed<HomeHero>(() => this.#homeDoc()?.hero ?? this.#storedHero ?? DEFAULT_HOME_HERO);

  /**
   * Live Section 2 (Shop Categories) from Firestore; falls back to the saved
   * copy, then DEFAULT_HOME_SHOP_CATEGORIES.
   */
  readonly shopCategories = computed<HomeShopCategories>(
    () => this.#homeDoc()?.shopCategories ?? this.#storedShopCategories ?? DEFAULT_HOME_SHOP_CATEGORIES,
  );

  /**
   * Live Section 3 (category list) from Firestore. A settings/home document
   * without navList falls through to the saved list, then DEFAULT_HOME_NAV_LIST.
   */
  readonly navList = computed<HomeNavList>(
    () => this.#homeDoc()?.navList ?? this.#storedNavList ?? DEFAULT_HOME_NAV_LIST,
  );

  /**
   * Publishes the homepage hero, shop cards, and category list together.
   */
  async updateHomeSettings(settings: HomeSettingsUpdate): Promise<void> {
    const payload: HomeSettings = {
      id: 'home',
      hero: settings.hero,
      shopCategories: settings.shopCategories,
      navList: settings.navList,
      updatedAt: serverTimestamp(),
    };
    await setDoc(this.#homeDocRef, payload, { merge: true });
  }

  /**
   * Resets all home page sections to factory defaults.
   */
  async resetDefaultHomeSettings(): Promise<void> {
    await this.updateHomeSettings({
      hero: DEFAULT_HOME_HERO,
      shopCategories: DEFAULT_HOME_SHOP_CATEGORIES,
      navList: DEFAULT_HOME_NAV_LIST,
    });
  }
}
