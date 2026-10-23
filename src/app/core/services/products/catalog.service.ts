import { computed, Service } from '@angular/core';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalCollection, signalDoc } from '@shared/utils/firebase/firestore-signals';
import { SEED_BRANDS, SEED_CATEGORIES, type SeedBrand, type SeedCategory } from './catalog-taxonomy';
import { BrandSchema, CategorySchema } from './category.schema';
import {
  BRANDS_COLLECTION,
  CATALOG_BRAND_IDS,
  CATALOG_CATEGORY_IDS,
  CATALOG_DOC,
  CATEGORIES_COLLECTION,
  PRODUCT_BRANDS,
  PRODUCT_TYPES,
} from './product.constants';
import type { Brand, CatalogSummary, Category, CategoryTreeNode } from './product.model';
import { CatalogSummarySchema } from './product.schema';
import { catalogPathIsEmpty } from './utils/catalog-path';

/**
 * Live published categories, brands, and counts from settings/catalog.
 * A missing or incomplete summary document (including an import lock) means "unknown",
 * so the storefront keeps every navigation link.
 */
@Service()
export class CatalogService {
  readonly #firestore = injectFirestore();
  readonly #catalogDoc = signalDoc(doc(this.#firestore, CATALOG_DOC[0], CATALOG_DOC[1]));

  readonly #categoriesCollection = collection(
    this.#firestore,
    CATEGORIES_COLLECTION,
  ).withConverter(createValibotConverter(CategorySchema));

  readonly #brandsCollection = collection(this.#firestore, BRANDS_COLLECTION).withConverter(
    createValibotConverter(BrandSchema),
  );

  readonly categories = signalCollection(
    query(
      this.#categoriesCollection,
      where('published', '==', true),
      orderBy('sortOrder', 'asc'),
      limit(100),
    ),
  );

  readonly brands = signalCollection(
    query(
      this.#brandsCollection,
      where('published', '==', true),
      orderBy('sortOrder', 'asc'),
      limit(100),
    ),
  );

  readonly summary = computed((): CatalogSummary | null => {
    const raw = this.#catalogDoc();
    if (!raw) return null;
    const parsed = v.safeParse(CatalogSummarySchema, raw);
    return parsed.success ? parsed.output : null;
  });

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
    return set;
  });

  readonly visibleTypes = computed(() => {
    const summary = this.summary();
    if (!summary) return PRODUCT_TYPES;
    return PRODUCT_TYPES.filter((type) => (summary.types[type.id] ?? 0) > 0);
  });

  readonly visibleBrands = computed(() => {
    const summary = this.summary();
    if (!summary) return PRODUCT_BRANDS;
    return PRODUCT_BRANDS.filter((brand) => (summary.brands[brand.id] ?? 0) > 0);
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
      SEED_BRANDS.find(
        (item) => item.slug.toLowerCase() === target || item.id.toLowerCase() === target,
      ) ?? null
    );
  }

  isEmpty(path: string): boolean {
    const summary = this.summary();
    if (!summary) return false;
    return catalogPathIsEmpty(summary, path, this.#knownCategoryIds(), this.#knownBrandIds());
  }
}
