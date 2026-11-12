import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, Service, signal, TransferState } from '@angular/core';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CatalogService } from '@core/services/products/catalog.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { NavSettingsSchema } from './nav.schema';
import { NavCategory, NavSettings } from './nav.model';
import { NAV_CATEGORIES } from './nav.data';
import { resolveStorefrontTargets, visibleStorefrontCategories } from './nav-visibility';
import type { NavTargetCatalog } from './nav-target';
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

function docHasCategories(docData: NavSettings | null | undefined): docData is NavSettings {
  return !!docData?.categories && docData.categories.length > 0;
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

  /** undefined until the SSR seed or first browser read settles. */
  readonly #navDoc = signal<NavSettings | null | undefined>(undefined);

  /**
   * True after CSR bootstrap (getDoc + timeout) or SSR seed — safe to show bundled fallback nav.
   */
  readonly #bootstrapSettled = signal(false);

  constructor() {
    let hadTransferSeed = false;
    if (this.#transfer.hasKey(NAVIGATION_SETTINGS_KEY)) {
      hadTransferSeed = true;
      this.#navDoc.set(seedToDocData(this.#transfer.get(NAVIGATION_SETTINGS_KEY, null)));
      this.#bootstrapSettled.set(true);
      if (isPlatformBrowser(this.#platformId)) {
        this.#transfer.remove(NAVIGATION_SETTINGS_KEY);
      }
    } else if (!isPlatformBrowser(this.#platformId)) {
      this.#navDoc.set(null);
      this.#bootstrapSettled.set(true);
    }

    if (isPlatformBrowser(this.#platformId)) {
      if (hadTransferSeed) {
        this.#attachNavListener();
      } else {
        void this.#bootstrapClientNavigation();
      }
    }
  }

  async #bootstrapClientNavigation(): Promise<void> {
    try {
      const snap = await getDoc(this.#navDocRef);
      if (this.#navDoc() === undefined) {
        this.#navDoc.set(snap.exists() ? snap.data() : null);
      }
    } catch {
      // Fall through to timeout; onSnapshot attaches after bootstrap settles.
    }

    if (this.#navDoc() === undefined) {
      await new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          if (this.#navDoc() === undefined) {
            this.#navDoc.set(null);
          }
          resolve();
        }, SHELL_READY_TIMEOUT_MS);
        this.#destroyRef.onDestroy(() => window.clearTimeout(timeoutId));
      });
    }

    this.#bootstrapSettled.set(true);
    this.#attachNavListener();
  }

  #attachNavListener(): void {
    const unsubscribe = onSnapshot(
      this.#navDocRef,
      (snapshot) => {
        this.#navDoc.set(snapshot.exists() ? snapshot.data() : null);
        this.#bootstrapSettled.set(true);
      },
      () => {
        if (this.#navDoc() === undefined) {
          this.#navDoc.set(null);
          this.#bootstrapSettled.set(true);
        }
      },
    );
    this.#destroyRef.onDestroy(unsubscribe);
  }

  /** First navigation value received (SSR seed, explicit null, or live snapshot). */
  readonly shellReady = computed(() => this.#navDoc() !== undefined);

  /**
   * Top nav may render: Firestore categories are present, or bootstrap confirmed a missing doc.
   */
  readonly navLinksReady = computed(() => {
    if (!this.#catalog.shellReady()) return false;
    const docData = this.#navDoc();
    if (docData === undefined) return false;
    if (docHasCategories(docData)) return true;
    return this.#bootstrapSettled();
  });

  readonly isLoading = computed<boolean>(() => this.#navDoc() === undefined);

  readonly categories = computed<readonly NavCategory[]>(() => {
    const docData = this.#navDoc();
    if (docData === undefined) {
      return [];
    }
    if (docHasCategories(docData)) {
      return docData.categories;
    }
    if (!this.#bootstrapSettled()) {
      return [];
    }
    return NAV_CATEGORIES;
  });

  /**
   * Published categories and brands for building link addresses from their targets, or null
   * on the server and until both lists have loaded (links then use their saved `path`).
   */
  readonly #targetCatalog = computed<NavTargetCatalog | null>(() => {
    const categories = this.#catalog.categories();
    const brands = this.#catalog.brands();
    if (!categories?.length || !brands?.length) return null;
    return { categories, brands };
  });

  readonly storefrontCategories = computed<readonly NavCategory[]>(() =>
    visibleStorefrontCategories(resolveStorefrontTargets(this.categories(), this.#targetCatalog()), (path) =>
      this.#catalog.isEmpty(path),
    ),
  );

  async resetDefaultNavigation(categories: readonly NavCategory[] = NAV_CATEGORIES): Promise<void> {
    await this.updateNavigation(categories);
  }

  async seedDefaultNavigation(categories: readonly NavCategory[] = NAV_CATEGORIES): Promise<void> {
    await this.resetDefaultNavigation(categories);
  }

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
