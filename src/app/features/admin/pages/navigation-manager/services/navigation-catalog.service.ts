import { computed, inject, resource, Service } from '@angular/core';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import {
  timeToMs,
  type NavAutoSources,
  type NavTargetCatalog,
  type NavTargetEntry,
} from '@core/services/navigation';
import { BRANDS_COLLECTION, CATEGORIES_COLLECTION } from '@core/services/products';
import { CatalogService } from '@core/services/products/catalog.service';

/** Enough of a category or brand doc to pick it as a link target. */
const EntrySchema = v.object({
  slug: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  published: v.optional(v.boolean(), false),
  parentId: v.optional(v.nullable(v.string()), null),
  sortOrder: v.optional(v.number(), 0),
  createdAt: v.optional(v.unknown()),
});

/** A category or brand shown in the Links To list. */
export interface NavPickEntry extends NavTargetEntry {
  /** "Apparel › Socks" for a sub-category, the name otherwise. */
  readonly displayName: string;
  /** Categories only: the parent category, null for a top-level one (and for brands). */
  readonly parentId: string | null;
  readonly sortOrder: number;
  /** When it was added; 0 when unknown (for "Newest Brands"). */
  readonly createdAtMs: number;
}

type ReadEntry = Omit<NavPickEntry, 'displayName'>;

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
  readonly #published = inject(CatalogService);

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

  async #read(name: string): Promise<ReadEntry[]> {
    const snap = await getDocs(query(collection(this.#firestore, name), limit(MAX_ENTRIES)));
    return snap.docs.flatMap((doc) => {
      const parsed = v.safeParse(EntrySchema, doc.data());
      if (!parsed.success) return [];
      const { createdAt, ...entry } = parsed.output;
      return [{ id: doc.id, ...entry, createdAtMs: timeToMs(createdAt) }];
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

  /**
   * The full lists when loaded, else the store's published lists (for building addresses
   * while the full read is loading or failed; a hidden target then keeps its saved address).
   */
  readonly bestCatalog = computed<NavTargetCatalog>(() => {
    const full = this.targetCatalog();
    if (full) return full;
    return {
      categories: this.#published.categories() ?? [],
      brands: this.#published.brands() ?? [],
    };
  });

  /**
   * What Fill Automatically columns list on the store now (ATS-247): the shown categories and
   * brands from the full read, else the store's published lists while it loads or failed.
   */
  readonly autoSources = computed<NavAutoSources>(() => {
    const full = this.catalog();
    if (full) {
      return {
        categories: full.categories.filter((entry) => entry.published),
        brands: full.brands.filter((entry) => entry.published),
      };
    }
    return {
      categories: (this.#published.categories() ?? []).map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        name: entry.name,
        parentId: entry.parentId,
        sortOrder: entry.sortOrder,
      })),
      brands: (this.#published.brands() ?? []).map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        name: entry.name,
        sortOrder: entry.sortOrder,
        createdAtMs: timeToMs(entry.createdAt),
      })),
    };
  });

  /** Read the lists again on a later visit (the first visit's read is already running). */
  refresh(): void {
    if (this.#lists.hasValue() || this.#lists.error()) this.#lists.reload();
  }
}
