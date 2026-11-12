import { computed, resource, Service } from '@angular/core';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import type { NavTargetCatalog, NavTargetEntry } from '@core/services/navigation';
import { BRANDS_COLLECTION, CATEGORIES_COLLECTION } from '@core/services/products';

/** Enough of a category or brand doc to pick it as a link target. */
const EntrySchema = v.object({
  slug: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  published: v.optional(v.boolean(), false),
  parentId: v.optional(v.nullable(v.string()), null),
  sortOrder: v.optional(v.number(), 0),
});

/** A category or brand shown in the Links To list. */
export interface NavPickEntry extends NavTargetEntry {
  /** "Apparel › Socks" for a sub-category, the name otherwise. */
  readonly displayName: string;
}

interface CatalogLists {
  readonly categories: readonly NavPickEntry[];
  readonly brands: readonly NavPickEntry[];
}

/** Admins can read hidden categories and brands; the store's lists are published only. */
const MAX_ENTRIES = 300;

/**
 * Every category and brand, shown and hidden (Admin → Navigation only), so the editor can
 * offer them as link targets and mark a link whose target is hidden or gone.
 */
@Service()
export class NavigationCatalogService {
  readonly #firestore = injectFirestore();

  readonly #lists = resource({
    loader: async (): Promise<CatalogLists> => {
      const [categories, brands] = await Promise.all([
        this.#read(CATEGORIES_COLLECTION),
        this.#read(BRANDS_COLLECTION),
      ]);
      const byId = new Map(categories.map((entry) => [entry.id, entry]));
      return {
        categories: categories
          .map((entry) => {
            const parent = entry.parentId ? byId.get(entry.parentId) : undefined;
            return { ...entry, displayName: parent ? `${parent.name} › ${entry.name}` : entry.name };
          })
          .sort((left, right) => left.displayName.localeCompare(right.displayName)),
        brands: brands
          .map((entry) => ({ ...entry, displayName: entry.name }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    },
  });

  async #read(
    name: string,
  ): Promise<(NavTargetEntry & { readonly parentId: string | null; readonly sortOrder: number })[]> {
    const snap = await getDocs(query(collection(this.#firestore, name), limit(MAX_ENTRIES)));
    return snap.docs.flatMap((doc) => {
      const parsed = v.safeParse(EntrySchema, doc.data());
      if (!parsed.success) return [];
      return [{ id: doc.id, ...parsed.output }];
    });
  }

  /** Every category and brand once loaded; null while loading or when the read failed. */
  readonly catalog = computed<CatalogLists | null>(() =>
    this.#lists.hasValue() ? this.#lists.value() : null,
  );

  readonly isLoading = this.#lists.isLoading;
  readonly failed = computed(() => !!this.#lists.error());

  /** As a `NavTargetCatalog`, or null until loaded. */
  readonly targetCatalog = computed<NavTargetCatalog | null>(() => this.catalog());

  reload(): void {
    this.#lists.reload();
  }
}
