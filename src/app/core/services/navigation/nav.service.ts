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
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CatalogService } from '@core/services/products/catalog.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { NavSettingsSchema } from './nav.schema';
import { NavCategory, NavSettings } from './nav.model';
import { NAV_CATEGORIES } from './nav.data';
import { visibleStorefrontCategories } from './nav-visibility';
import {
  NAVIGATION_SETTINGS_KEY,
  navigationSeedToDoc,
  type NavigationSettingsSeed,
} from './navigation-settings.state';

/** Match shipping settings so a stuck Firestore listen cannot block the shell forever. */
const SHELL_READY_TIMEOUT_MS = 2500;

function seedToDocData(seed: NavigationSettingsSeed | null): NavSettings | null {
  return seed ? navigationSeedToDoc(seed) : null;
}

@Service()
export class NavService {
  readonly #firestore = injectFirestore();
  readonly #catalog = inject(CatalogService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);
  readonly #transfer = inject(TransferState);

  readonly #navDocRef = doc(this.#firestore, 'settings', 'navigation').withConverter(
    createValibotConverter(NavSettingsSchema),
  );

  /** undefined until the SSR seed or first browser snapshot settles. */
  readonly #navDoc = signal<NavSettings | null | undefined>(undefined);

  constructor() {
    if (this.#transfer.hasKey(NAVIGATION_SETTINGS_KEY)) {
      this.#navDoc.set(seedToDocData(this.#transfer.get(NAVIGATION_SETTINGS_KEY, null)));
      if (isPlatformBrowser(this.#platformId)) {
        this.#transfer.remove(NAVIGATION_SETTINGS_KEY);
      }
    } else if (!isPlatformBrowser(this.#platformId)) {
      this.#navDoc.set(null);
    }

    if (isPlatformBrowser(this.#platformId)) {
      const unsubscribe = onSnapshot(
        this.#navDocRef,
        (snapshot) => {
          this.#navDoc.set(
            snapshot.exists() ? snapshot.data() : null,
          );
        },
        () => {
          this.#navDoc.set(null);
        },
      );
      this.#destroyRef.onDestroy(unsubscribe);

      if (this.#navDoc() === undefined) {
        const timeoutId = window.setTimeout(() => {
          if (this.#navDoc() === undefined) {
            this.#navDoc.set(null);
          }
        }, SHELL_READY_TIMEOUT_MS);
        this.#destroyRef.onDestroy(() => window.clearTimeout(timeoutId));
      }
    }
  }

  /** First navigation value received (SSR seed, explicit null, or live snapshot). */
  readonly shellReady = computed(() => this.#navDoc() !== undefined);

  /**
   * Indicates whether the live document is currently being fetched.
   */
  readonly isLoading = computed<boolean>(() => this.#navDoc() === undefined);

  /**
   * Live categories from Firestore; bundled defaults only when the doc is missing or empty.
   */
  readonly categories = computed<readonly NavCategory[]>(() => {
    const docData = this.#navDoc();
    if (docData === undefined) {
      return [];
    }
    if (docData?.categories && docData.categories.length > 0) {
      return docData.categories;
    }
    return NAV_CATEGORIES;
  });

  /**
   * Storefront menus. Empty known categories and brands disappear once
   * settings/catalog has counts. Until then every saved link stays visible.
   */
  readonly storefrontCategories = computed<readonly NavCategory[]>(() =>
    visibleStorefrontCategories(this.categories(), (path) => this.#catalog.isEmpty(path)),
  );

  /**
   * Resets the store navigation document with default categories.
   */
  async resetDefaultNavigation(categories: readonly NavCategory[] = NAV_CATEGORIES): Promise<void> {
    await this.updateNavigation(categories);
  }

  /**
   * @deprecated Use resetDefaultNavigation instead.
   */
  async seedDefaultNavigation(categories: readonly NavCategory[] = NAV_CATEGORIES): Promise<void> {
    await this.resetDefaultNavigation(categories);
  }

  /**
   * Publishes updated navigation categories.
   */
  async updateNavigation(categories: readonly NavCategory[]): Promise<void> {
    const payload: NavSettings = {
      id: 'navigation',
      categories: [...categories],
      version: 1,
      updatedAt: serverTimestamp(),
    };
    await setDoc(this.#navDocRef, payload, { merge: true });
  }
}
