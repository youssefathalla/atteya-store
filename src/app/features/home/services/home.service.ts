import { computed, Service } from '@angular/core';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalDoc } from '@shared/utils/firebase/firestore-signals';
import { HomeSettingsSchema } from '../schemas/home.schema';
import {
  HomeHero,
  HomeSettings,
  HomeShopCategories,
} from '../models/home.model';
import {
  DEFAULT_HOME_HERO,
  DEFAULT_HOME_SHOP_CATEGORIES,
} from '../data/home.data';

const HERO_STORAGE_KEY = 'atteya_store_home_hero';
const SHOP_CATEGORIES_STORAGE_KEY = 'atteya_store_home_shop_categories';

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

@Service()
export class HomeService {
  readonly #firestore = injectFirestore();

  readonly #homeDocRef = doc(this.#firestore, 'settings', 'home').withConverter(
    createValibotConverter(HomeSettingsSchema),
  );

  readonly #homeDoc = signalDoc(this.#homeDocRef);

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
   * Publishes updated home settings (Section 1 Hero + Section 2 Shop Categories) to Firestore.
   */
  async updateHomeSettings(
    hero: HomeHero,
    shopCategories: HomeShopCategories,
  ): Promise<void> {
    const payload: HomeSettings = {
      id: 'home',
      hero,
      shopCategories,
      updatedAt: serverTimestamp(),
    };
    await setDoc(this.#homeDocRef, payload, { merge: true });
  }

  /**
   * Resets all home page sections to factory defaults.
   */
  async resetDefaultHomeSettings(): Promise<void> {
    await this.updateHomeSettings(DEFAULT_HOME_HERO, DEFAULT_HOME_SHOP_CATEGORIES);
  }
}
