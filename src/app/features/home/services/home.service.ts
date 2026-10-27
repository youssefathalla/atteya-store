import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  Service,
  signal,
  TransferState,
} from '@angular/core';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { HomeSettingsSchema } from '../schemas/home.schema';
import { HOME_SETTINGS_KEY, HomeSettingsSeed, toHomeSettingsSeed } from '../resolvers/home-settings.state';
import {
  HomeHero,
  HomeNavList,
  HomeSettings,
  HomeShopCategories,
} from '../models/home.model';
import {
  DEFAULT_HOME_HERO,
  DEFAULT_HOME_NAV_LIST,
  DEFAULT_HOME_SHOP_CATEGORIES,
} from '../data/home.data';

const HERO_STORAGE_KEY = 'atteya_store_home_hero';
const SHOP_CATEGORIES_STORAGE_KEY = 'atteya_store_home_shop_categories';
const NAV_LIST_STORAGE_KEY = 'atteya_store_home_nav_list';

export interface HomeSettingsUpdate {
  readonly hero: HomeHero;
  readonly shopCategories: HomeShopCategories;
  readonly navList: HomeNavList;
}

function readStoredHero(): HomeHero | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(HERO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.layoutCount === 'number' && Array.isArray(parsed.slides)) {
      return parsed as HomeHero;
    }
  } catch {
    // Ignore storage parse issues
  }
  return null;
}

function persistStoredHero(hero: HomeHero): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(hero));
  } catch {
    // Ignore storage quota issues
  }
}

function readStoredShopCategories(): HomeShopCategories | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SHOP_CATEGORIES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.cards)) {
      return parsed as HomeShopCategories;
    }
  } catch {
    // Ignore storage parse issues
  }
  return null;
}

function persistStoredShopCategories(shopCategories: HomeShopCategories): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHOP_CATEGORIES_STORAGE_KEY, JSON.stringify(shopCategories));
  } catch {
    // Ignore storage quota issues
  }
}

function readStoredNavList(): HomeNavList | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(NAV_LIST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.items)) {
      return parsed as HomeNavList;
    }
  } catch {
    // Ignore storage parse issues
  }
  return null;
}

function persistStoredNavList(navList: HomeNavList): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NAV_LIST_STORAGE_KEY, JSON.stringify(navList));
  } catch {
    // Ignore storage quota issues
  }
}

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
        this.#homeDoc.set(snapshot.exists() ? toHomeSettingsSeed(snapshot.data()) : null);
      },
      () => {
        this.#homeDoc.set(null);
      },
    );
    this.#destroyRef.onDestroy(unsubscribe);
  }

  /**
   * Indicates whether the live home settings document is loading.
   */
  readonly isLoading = computed<boolean>(() => this.#homeDoc() === undefined);

  /**
   * Evaluates to live hero configuration from Firestore;
   * Falls back gracefully to cached hero or DEFAULT_HOME_HERO when unseeded or loading.
   */
  readonly hero = computed<HomeHero>(() => {
    const docData = this.#homeDoc();
    if (docData?.hero) {
      persistStoredHero(docData.hero);
      return docData.hero;
    }
    return readStoredHero() ?? DEFAULT_HOME_HERO;
  });

  /**
   * Evaluates to live Section 2 (Shop Categories) configuration from Firestore;
   * Falls back gracefully to cached configuration or DEFAULT_HOME_SHOP_CATEGORIES.
   */
  readonly shopCategories = computed<HomeShopCategories>(() => {
    const docData = this.#homeDoc();
    if (docData?.shopCategories) {
      persistStoredShopCategories(docData.shopCategories);
      return docData.shopCategories;
    }
    return readStoredShopCategories() ?? DEFAULT_HOME_SHOP_CATEGORIES;
  });

  /**
   * Evaluates to live Section 3 (category list) configuration from Firestore.
   * A settings/home document without navList falls through to the cached list,
   * then to DEFAULT_HOME_NAV_LIST.
   */
  readonly navList = computed<HomeNavList>(() => {
    const docData = this.#homeDoc();
    if (docData?.navList) {
      persistStoredNavList(docData.navList);
      return docData.navList;
    }
    return readStoredNavList() ?? DEFAULT_HOME_NAV_LIST;
  });

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
