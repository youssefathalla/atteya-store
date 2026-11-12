import { inject, Service } from '@angular/core';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { BrandSchema, CategorySchema } from '@core/services/products/category.schema';
import type { Brand, Category } from '@core/services/products/product.model';
import {
  BRANDS_COLLECTION,
  CATEGORIES_COLLECTION,
  PRODUCTS_COLLECTION,
} from '@core/services/products/product.constants';
import { SearchService } from '@core/services/search';
import type { BrandDraft, CatalogKind, CategoryDraft } from '../utils/catalog-manager.utils';

/** The lists are about thirty entries; this is a safety cap. */
const LIST_LIMIT = 300;

const SaveResultSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  resynced: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type SaveResult = v.InferOutput<typeof SaveResultSchema>;

/**
 * Admin Categories & Brands (ATS-245). Reads every category and brand, shown or hidden
 * (its own unfiltered query; the storefront's `CatalogService` stays published-only), and
 * writes only through the admin callables.
 */
@Service()
export class CatalogAdminService {
  readonly #firestore = injectFirestore();
  readonly #functions = injectFunctionsAsync();
  readonly #search = inject(SearchService);

  async listCategories(): Promise<readonly Category[]> {
    const snap = await getDocs(
      query(
        collection(this.#firestore, CATEGORIES_COLLECTION),
        orderBy('sortOrder', 'asc'),
        limit(LIST_LIMIT),
      ),
    );
    return snap.docs.flatMap((item) => {
      const parsed = v.safeParse(CategorySchema, { ...item.data(), id: item.id });
      return parsed.success ? [parsed.output] : [];
    });
  }

  async listBrands(): Promise<readonly Brand[]> {
    const snap = await getDocs(
      query(collection(this.#firestore, BRANDS_COLLECTION), orderBy('sortOrder', 'asc'), limit(LIST_LIMIT)),
    );
    return snap.docs.flatMap((item) => {
      const parsed = v.safeParse(BrandSchema, { ...item.data(), id: item.id });
      return parsed.success ? [parsed.output] : [];
    });
  }

  /** Products (shown or hidden) in a category or of a brand: what blocks a delete. */
  async productsUsing(kind: CatalogKind, id: string): Promise<number> {
    const products = collection(this.#firestore, PRODUCTS_COLLECTION);
    const usage =
      kind === 'categories'
        ? query(products, where('categoryIds', 'array-contains', id))
        : query(products, where('brandId', '==', id));
    const snap = await getCountFromServer(usage);
    return snap.data().count;
  }

  async saveCategory(draft: CategoryDraft): Promise<SaveResult> {
    return this.#save('saveCategory', draft);
  }

  async saveBrand(draft: BrandDraft): Promise<SaveResult> {
    return this.#save('saveBrand', draft);
  }

  async delete(kind: CatalogKind, id: string): Promise<void> {
    const name = kind === 'categories' ? 'deleteCategory' : 'deleteBrand';
    const call = await callableFrom<{ id: string }, unknown>(this.#functions(), name);
    await call({ id });
    await this.#search.clearCache();
  }

  /** Saves the order of one level (top-level categories, one parent's sub-categories, or brands). */
  async reorder(kind: CatalogKind, ids: readonly string[]): Promise<void> {
    const call = await callableFrom<{ kind: CatalogKind; ids: readonly string[] }, unknown>(
      this.#functions(),
      'reorderCatalog',
    );
    await call({ kind, ids });
  }

  async #save(name: 'saveCategory' | 'saveBrand', payload: CategoryDraft | BrandDraft): Promise<SaveResult> {
    const call = await callableFrom<CategoryDraft | BrandDraft, unknown>(this.#functions(), name);
    const result = await call(payload);
    const parsed = v.safeParse(SaveResultSchema, result.data);
    if (!parsed.success) {
      throw new Error('The change was saved, but the response was unexpected. Reload the page.');
    }
    await this.#search.clearCache();
    return parsed.output;
  }
}
