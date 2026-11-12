import { inject, Service } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import * as v from 'valibot';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { NavService } from '@core/services/navigation/nav.service';
import { NavSettingsSchema } from '@core/services/navigation/nav.schema';
import type { NavCategory } from '@core/services/navigation/nav.model';
import { BrandSchema, CategorySchema } from '@core/services/products/category.schema';
import type { Brand, Category } from '@core/services/products/product.model';
import { BRANDS_COLLECTION, CATEGORIES_COLLECTION } from '@core/services/products/product.constants';
import { SearchService } from '@core/services/search';
import type { BrandDraft, CatalogKind, CategoryDraft } from '../utils/catalog-manager.utils';
import {
  addLinkToMenu,
  removeFromMenu,
  type DeletedMenuItem,
  type NewMenuLink,
} from '../utils/menu-placement.utils';

/** The lists are about thirty entries; this is a safety cap. */
const LIST_LIMIT = 300;

/** Longest the dialog waits for the menu step before it says it couldn't. */
const MENU_SAVE_TIMEOUT_MS = 15_000;

const SaveResultSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  resynced: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type SaveResult = v.InferOutput<typeof SaveResultSchema>;

const DeleteResultSchema = v.object({
  id: v.string(),
  deleted: v.boolean(),
  blocked: v.nullable(v.string()),
  offers: v.pipe(v.array(v.string()), v.maxLength(500)),
  products: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export type DeleteResult = v.InferOutput<typeof DeleteResultSchema>;

/** Rejects with `message` when `work` takes longer than the menu save may. */
async function withTimeout(work: Promise<void>, message: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), MENU_SAVE_TIMEOUT_MS);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Where "Add to the Menu" puts the link (ATS-248). */
export interface MenuPlacement {
  readonly menuId: string;
  readonly columnIndex: number;
}

/** What the Add dialogs close with: the save, plus whether the menu step was asked for and failed. */
export interface CatalogDialogResult extends SaveResult {
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
  readonly #auth = inject(AuthService);

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

  async saveCategory(draft: CategoryDraft): Promise<SaveResult> {
    return this.#save('saveCategory', draft);
  }

  async saveBrand(draft: BrandDraft): Promise<SaveResult> {
    return this.#save('saveBrand', draft);
  }

  /**
   * Adds a link to the end of one column in `settings/navigation` (ATS-248), through the same
   * save Navigation uses. Reads the saved navigation first, so a change made in Navigation a
   * moment ago is kept. Throws when the menu or column is gone or fills itself, or after 15 seconds.
   */
  async addToMenu(placement: MenuPlacement, link: NewMenuLink): Promise<void> {
    const work = async (): Promise<void> => {
      const next = addLinkToMenu(
        await this.#savedNavigation(),
        placement.menuId,
        placement.columnIndex,
        link,
      );
      if (!next) throw new Error('That menu column is no longer there.');
      await this.#nav.updateNavigation(next, this.#auth.user()?.uid ?? '');
    };
    await withTimeout(work(), 'Saving the menu took too long.');
  }

  /** The saved menus; the live ones (or the built-in menu) only when nothing is saved yet. */
  async #savedNavigation(): Promise<readonly NavCategory[]> {
    const snap = await getDoc(doc(this.#firestore, 'settings', 'navigation'));
    const parsed = snap.exists() ? v.safeParse(NavSettingsSchema, snap.data()) : null;
    return parsed?.success && parsed.output.categories.length > 0
      ? parsed.output.categories
      : this.#nav.categories();
  }

  /**
   * Asks the server whether a category or brand can be deleted (ATS-265): `blocked` says why not
   * (products in it, or categories inside it), `offers` names the offers that stop including it.
   */
  async checkDelete(kind: CatalogKind, id: string): Promise<DeleteResult> {
    return this.#delete(kind, id, true);
  }

  /** Deletes it on the server; offers that named it are returned for the snackbar. */
  async delete(kind: CatalogKind, id: string): Promise<DeleteResult> {
    const result = await this.#delete(kind, id, false);
    await this.#search.clearCache();
    return result;
  }

  /**
   * Takes every menu link to a deleted category or brand out of `settings/navigation` (ATS-265),
   * through the same save Navigation uses, so Navigation never shows a link to something gone.
   * Saves nothing when the menu never mentioned it; throws after 15 seconds.
   */
  async removeFromMenu(item: DeletedMenuItem): Promise<void> {
    const work = async (): Promise<void> => {
      const snap = await getDoc(doc(this.#firestore, 'settings', 'navigation'));
      const parsed = snap.exists() ? v.safeParse(NavSettingsSchema, snap.data()) : null;
      // Nothing saved yet: the built-in menu already leaves deleted built-ins out.
      if (!parsed?.success || parsed.output.categories.length === 0) return;
      const { next, changed } = removeFromMenu(parsed.output.categories, item);
      if (changed) await this.#nav.updateNavigation(next, this.#auth.user()?.uid ?? '');
    };
    await withTimeout(work(), 'Saving the menu took too long.');
  }

  async #delete(kind: CatalogKind, id: string, check: boolean): Promise<DeleteResult> {
    const name = kind === 'categories' ? 'deleteCategory' : 'deleteBrand';
    const call = await callableFrom<{ id: string; check: boolean }, unknown>(this.#functions(), name);
    const result = await call({ id, check });
    const parsed = v.safeParse(DeleteResultSchema, result.data);
    // An older server answers without the check fields: nothing blocked, no offers known.
    return parsed.success ? parsed.output : { id, deleted: !check, blocked: null, offers: [], products: 0 };
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
