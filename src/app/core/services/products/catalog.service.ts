import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  Injector,
  PLATFORM_ID,
  Service,
  signal,
  TransferState,
} from '@angular/core';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { NavAutoBrandsService } from '@core/services/navigation/nav-auto-brands.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalCollection } from '@shared/utils/firebase/firestore-signals';
import { CATALOG_SETTINGS_KEY, catalogSeedToRaw } from './catalog-settings.state';
import { SEED_BRANDS, SEED_CATEGORIES, type SeedBrand, type SeedCategory } from './catalog-taxonomy';
import { BrandSchema, CategorySchema } from './category.schema';
import {
  BRANDS_COLLECTION,
  CATALOG_BRAND_IDS,
  CATALOG_CATEGORY_IDS,
  CATALOG_DOC,
  CATEGORIES_COLLECTION,
  PRODUCT_TYPES,
} from './product.constants';
import type { Brand, CatalogSummary, Category, CategoryTreeNode } from './product.model';
import { CatalogSummarySchema } from './product.schema';
import { ShopCategoriesService } from './shop-categories.service';
import { catalogPathIsEmpty } from './utils/catalog-path';

/** Match nav/shipping so a stuck Firestore listen cannot block the shell forever. */
const SHELL_READY_TIMEOUT_MS = 2500;

/**
 * Live published categories, brands, and counts from settings/catalog.
 * A missing or incomplete summary document (including an import lock) means "unknown",
 * so the storefront keeps every navigation link.
 */
@Service()
export class CatalogService {
  readonly #firestore = injectFirestore();
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);
  readonly #transfer = inject(TransferState);
  readonly #injector = inject(Injector);

  readonly #catalogDocRef = doc(this.#firestore, CATALOG_DOC[0], CATALOG_DOC[1]);

  /** undefined until the SSR seed or first browser read settles. */
  readonly #catalogRaw = signal<unknown | null | undefined>(undefined);

  readonly #categoriesCollection = collection(this.#firestore, CATEGORIES_COLLECTION).withConverter(
    createValibotConverter(CategorySchema),
  );

  readonly #brandsCollection = collection(this.#firestore, BRANDS_COLLECTION).withConverter(
    createValibotConverter(BrandSchema),
  );

  constructor() {
    if (this.#transfer.hasKey(CATALOG_SETTINGS_KEY)) {
      this.#catalogRaw.set(catalogSeedToRaw(this.#transfer.get(CATALOG_SETTINGS_KEY, null)));
      if (isPlatformBrowser(this.#platformId)) {
        this.#transfer.remove(CATALOG_SETTINGS_KEY);
      }
    } else if (!isPlatformBrowser(this.#platformId)) {
      this.#catalogRaw.set(null);
    }

    if (isPlatformBrowser(this.#platformId)) {
      if (this.#catalogRaw() !== undefined) {
        this.#attachCatalogListener();
      } else {
        void this.#bootstrapClientCatalog();
      }
    }
  }

  async #bootstrapClientCatalog(): Promise<void> {
    try {
      const snap = await getDoc(this.#catalogDocRef);
      if (this.#catalogRaw() === undefined) {
        this.#catalogRaw.set(snap.exists() ? snap.data() : null);
      }
    } catch {
      // Fall through to timeout; onSnapshot attaches after bootstrap settles.
    }

    if (this.#catalogRaw() === undefined) {
      await new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          if (this.#catalogRaw() === undefined) {
            this.#catalogRaw.set(null);
          }
          resolve();
        }, SHELL_READY_TIMEOUT_MS);
        this.#destroyRef.onDestroy(() => window.clearTimeout(timeoutId));
      });
    }

    this.#attachCatalogListener();
  }

  #attachCatalogListener(): void {
    const unsubscribe = onSnapshot(
      this.#catalogDocRef,
      (snapshot) => {
        this.#catalogRaw.set(snapshot.exists() ? snapshot.data() : null);
      },
      () => {
        if (this.#catalogRaw() === undefined) {
          this.#catalogRaw.set(null);
        }
      },
    );
    this.#destroyRef.onDestroy(unsubscribe);
  }

  readonly categories = signalCollection(
    query(
      this.#categoriesCollection,
      where('published', '==', true),
      orderBy('sortOrder', 'asc'),
      limit(100),
    ),
  );

  readonly brands = signalCollection(
    query(this.#brandsCollection, where('published', '==', true), orderBy('sortOrder', 'asc'), limit(100)),
  );

  readonly summary = computed((): CatalogSummary | null => {
    const raw = this.#catalogRaw();
    if (!raw) return null;
    const parsed = v.safeParse(CatalogSummarySchema, raw);
    return parsed.success ? parsed.output : null;
  });

  /** True after the first settings/catalog snapshot (missing doc counts as settled). */
  readonly shellReady = computed(() => this.#catalogRaw() !== undefined);

  readonly counts = this.summary;

  readonly categoryTree = computed((): readonly CategoryTreeNode[] => {
    const items = this.categories() ?? [];
    const roots = items.filter((item) => item.parentId === null);
    return roots.map((root) => ({
      ...root,
      children: items
        .filter((child) => child.parentId === root.id)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }));
  });

  readonly #knownCategoryIds = computed((): ReadonlySet<string> => {
    const set = new Set<string>([
      ...CATALOG_CATEGORY_IDS,
      ...SEED_CATEGORIES.map((category) => category.id),
      ...SEED_CATEGORIES.map((category) => category.slug),
    ]);
    for (const category of this.categories() ?? []) {
      set.add(category.id);
      set.add(category.slug);
    }
    // The server-read list too, so a category added in Categories & Brands counts as known on
    // the server and in the first browser render, before the live list arrives.
    for (const category of this.#injector.get(ShopCategoriesService).categories()) {
      set.add(category.id);
      set.add(category.slug);
    }
    return set;
  });

  readonly #knownBrandIds = computed((): ReadonlySet<string> => {
    const set = new Set<string>([
      ...CATALOG_BRAND_IDS,
      ...SEED_BRANDS.map((brand) => brand.id),
      ...SEED_BRANDS.map((brand) => brand.slug),
    ]);
    for (const brand of this.brands() ?? []) {
      set.add(brand.id);
      set.add(brand.slug);
    }
    // The server-read list too, so a brand added in Categories & Brands counts as known on the
    // server and in the first browser render, before the live list arrives.
    for (const brand of this.#injector.get(NavAutoBrandsService).brands()) {
      set.add(brand.id);
      set.add(brand.slug);
    }
    return set;
  });

  readonly visibleTypes = computed(() => {
    const summary = this.summary();
    if (!summary) return PRODUCT_TYPES;
    return PRODUCT_TYPES.filter((type) => (summary.types[type.id] ?? 0) > 0);
  });

  /** Published brands (live docs, else the built-in ones) that have published products. */
  readonly visibleBrands = computed((): readonly { readonly id: string; readonly label: string }[] => {
    const live = this.brands();
    const all =
      live && live.length > 0
        ? live.map((brand) => ({ id: brand.id, label: brand.name }))
        : SEED_BRANDS.map((brand) => ({ id: brand.id, label: brand.name }));
    const summary = this.summary();
    if (!summary) return all;
    return all.filter((brand) => (summary.brands[brand.id] ?? 0) > 0);
  });

  categoryBySlug(slug: string): Category | SeedCategory | null {
    const target = slug.trim().toLowerCase();
    if (!target) return null;
    const live = (this.categories() ?? []).find(
      (item) => item.slug.toLowerCase() === target || item.id.toLowerCase() === target,
    );
    if (live) return live;
    return (
      SEED_CATEGORIES.find(
        (item) => item.slug.toLowerCase() === target || item.id.toLowerCase() === target,
      ) ?? null
    );
  }

  brandBySlug(slug: string): Brand | SeedBrand | null {
    const target = slug.trim().toLowerCase();
    if (!target) return null;
    const live = (this.brands() ?? []).find(
      (item) => item.slug.toLowerCase() === target || item.id.toLowerCase() === target,
    );
    if (live) return live;
    return (
      SEED_BRANDS.find((item) => item.slug.toLowerCase() === target || item.id.toLowerCase() === target) ??
      null
    );
  }

  isEmpty(path: string): boolean {
    const summary = this.summary();
    if (!summary) return false;
    return catalogPathIsEmpty(summary, path, this.#knownCategoryIds(), this.#knownBrandIds());
  }
}
