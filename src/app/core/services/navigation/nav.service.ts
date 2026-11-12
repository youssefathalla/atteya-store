import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, Service, signal, TransferState } from '@angular/core';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CatalogService } from '@core/services/products/catalog.service';
import { ShopCategoriesService } from '@core/services/products/shop-categories.service';
import { pathOpensDeletedBuiltIn } from '@core/services/products/utils/deleted-built-ins';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { NavSettingsSchema } from './nav.schema';
import { NavCategory, NavSettings } from './nav.model';
import { NAV_CATEGORIES } from './nav.data';
import { resolveStorefrontTargets, visibleStorefrontCategories } from './nav-visibility';
import type { NavTargetCatalog } from './nav-target';
import { expandAutoColumns, navNeedsBrands, type NavAutoSources } from './nav-auto-columns';
import { NavAutoBrandsService } from './nav-auto-brands.service';
import {
  NAVIGATION_SETTINGS_KEY,
  navigationSeedToDoc,
  type NavigationSettingsSeed,
} from './navigation-settings.state';

/** `CatalogService` reads at most this many published categories and brands. */
const CATALOG_LIST_LIMIT = 100;

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
  readonly #shopCategories = inject(ShopCategoriesService);
  readonly #autoBrands = inject(NavAutoBrandsService);
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
    // A brand column that fills itself waits for the brands, so it never pops in (ATS-247).
    if (docHasCategories(docData)) return !navNeedsBrands(docData.categories) || this.#autoBrands.ready();
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
    return this.builtInCategories();
  });

  /**
   * The built-in menu (`NAV_CATEGORIES`) without links to built-in categories and brands staff
   * deleted (ATS-265), so a menu that was never saved never shows a link to something gone.
   */
  readonly builtInCategories = computed<readonly NavCategory[]>(() => {
    const deleted = this.#catalog.deletedBuiltInIds();
    if (deleted.size === 0) return NAV_CATEGORIES;
    return visibleStorefrontCategories(NAV_CATEGORIES, (path) => pathOpensDeletedBuiltIn(path, deleted));
  });

  /**
   * Published categories and brands for building link addresses from their targets, or null
   * on the server and until both lists have loaded (links then use their saved `path`).
   */
  readonly #targetCatalog = computed<NavTargetCatalog | null>(() => {
    const categories = this.#catalog.categories();
    const brands = this.#catalog.brands();
    if (!categories?.length || !brands) return null;
    // The store's lists stop at 100; past that a real target could look missing, so keep saved paths.
    if (categories.length >= CATALOG_LIST_LIMIT || brands.length >= CATALOG_LIST_LIMIT) return null;
    return { categories, brands };
  });

  /**
   * Published brands and categories for auto columns (ATS-247): the server's lists (seeded through
   * TransferState) until the live ones load, so the server HTML and the first browser render match.
   */
  readonly #autoSources = computed<NavAutoSources>(() => ({
    brands: this.#autoBrands.brands(),
    categories: this.#shopCategories.categories().filter((category) => category.published !== false),
  }));

  /**
   * The navigation with each Fill Automatically column turned into the links it shows now
   * (ATS-247). Links are not yet hidden for hidden or empty targets; `storefrontCategories` does that.
   */
  readonly expandedCategories = computed<readonly NavCategory[]>(() =>
    expandAutoColumns(this.categories(), this.#autoSources(), (path) => this.#catalog.isEmpty(path)),
  );

  readonly storefrontCategories = computed<readonly NavCategory[]>(() =>
    this.#visible(this.expandedCategories()),
  );

  /**
   * Like `storefrontCategories`, but a column that fills itself lists everything, ignoring
   * "Show at most": the Brands page is the full list of brands (ATS-247).
   */
  readonly directoryCategories = computed<readonly NavCategory[]>(() =>
    this.#visible(
      expandAutoColumns(this.categories(), this.#autoSources(), (path) => this.#catalog.isEmpty(path), {
        noLimit: true,
      }),
    ),
  );

  #visible(categories: readonly NavCategory[]): readonly NavCategory[] {
    return visibleStorefrontCategories(resolveStorefrontTargets(categories, this.#targetCatalog()), (path) =>
      this.#catalog.isEmpty(path),
    );
  }

  async resetDefaultNavigation(
    updatedBy: string,
    categories: readonly NavCategory[] = this.builtInCategories(),
  ): Promise<void> {
    await this.updateNavigation(categories, updatedBy);
  }

  async seedDefaultNavigation(
    updatedBy: string,
    categories: readonly NavCategory[] = this.builtInCategories(),
  ): Promise<void> {
    await this.resetDefaultNavigation(updatedBy, categories);
  }

  /**
   * Saves the menu. `updatedBy` (the saver's uid) goes on the doc so Previous Versions can say
   * who saved each version (ATS-251; the rules require it to be the caller's uid). The
   * `onNavigationSettingsWrite` trigger keeps the version it replaced.
   */
  async updateNavigation(categories: readonly NavCategory[], updatedBy: string): Promise<void> {
    const payload: NavSettings = {
      id: 'navigation',
      categories: [...categories],
      version: 1,
      updatedAt: serverTimestamp(),
      updatedBy,
    };
    await setDoc(this.#navDocRef, payload, { merge: true });
  }
}
