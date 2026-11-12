import { inject, Service } from '@angular/core';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { NavService } from '@core/services/navigation/nav.service';
import { BrandSchema, CategorySchema } from '@core/services/products/category.schema';
import type { Brand, Category } from '@core/services/products/product.model';
import {
  BRANDS_COLLECTION,
  CATEGORIES_COLLECTION,
  PRODUCTS_COLLECTION,
} from '@core/services/products/product.constants';
import { SearchService } from '@core/services/search';
import type { BrandDraft, CatalogKind, CategoryDraft } from '../utils/catalog-manager.utils';
import { addLinkToMenu, type NewMenuLink } from '../utils/menu-placement.utils';

/** The lists are about thirty entries; this is a safety cap. */
const LIST_LIMIT = 300;

const SaveResultSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  resynced: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type SaveResult = v.InferOutput<typeof SaveResultSchema>;

/** Where "Add to the Menu" puts the link (ATS-248). */
export interface MenuPlacement {
  readonly menuId: string;
  readonly columnIndex: number;
}

/** What the Add dialogs close with: the save, plus whether the menu step was asked for and failed. */
export interface CatalogDialogResult extends SaveResult {
  readonly menuAdded?: boolean;
  readonly menuFailed?: boolean;
}

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
  readonly #nav = inject(NavService);

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

  /**
   * Adds a link to the end of one column in `settings/navigation` (ATS-248), through the same
   * save Navigation uses. Throws when the menu or column is gone or fills itself.
   */
  async addToMenu(placement: MenuPlacement, link: NewMenuLink): Promise<void> {
    const next = addLinkToMenu(this.#nav.categories(), placement.menuId, placement.columnIndex, link);
    if (!next) throw new Error('That menu column is no longer there.');
    await this.#nav.updateNavigation(next);
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
