import { Service } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { BrandSchema, CategorySchema } from '@core/services/products/category.schema';
import {
  BRANDS_COLLECTION,
  CATEGORIES_COLLECTION,
  PRODUCTS_COLLECTION,
} from '@core/services/products/product.constants';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import {
  buildSearchTokens,
  longestSearchWord,
  searchWordsFromTerm,
} from '@core/services/products/search-tokens';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type { ProductEditDraft } from '../models/product-admin.model';

const LIST_PAGE_SIZE = 500;
const SEARCH_QUERY_LIMIT = 201;

export interface ProductSearchResult {
  readonly products: readonly Product[];
  readonly truncated: boolean;
}

@Service()
export class ProductsAdminService {
  readonly #firestore = injectFirestore();
  readonly #productConverter = createValibotConverter(ProductSchema);

  async listAllProducts(): Promise<readonly Product[]> {
    const products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(
      this.#productConverter,
    );
    const all: Product[] = [];
    let lastDoc: QueryDocumentSnapshot<Product> | undefined;

    for (;;) {
      const pageQuery = lastDoc
        ? query(products, orderBy('name', 'asc'), startAfter(lastDoc), limit(LIST_PAGE_SIZE))
        : query(products, orderBy('name', 'asc'), limit(LIST_PAGE_SIZE));
      const snap = await getDocs(pageQuery);
      if (snap.empty) break;
      for (const docSnap of snap.docs) {
        all.push(docSnap.data());
        lastDoc = docSnap;
      }
      if (snap.docs.length < LIST_PAGE_SIZE) break;
    }

    return all;
  }

  async searchProducts(term: string): Promise<ProductSearchResult> {
    const words = searchWordsFromTerm(term);
    const anchor = longestSearchWord(words);
    if (!anchor) {
      return { products: [], truncated: false };
    }

    const products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(
      this.#productConverter,
    );
    const snap = await getDocs(
      query(products, where('searchTokens', 'array-contains', anchor), limit(SEARCH_QUERY_LIMIT)),
    );

    const matches = snap.docs
      .map((docSnap) => docSnap.data())
      .filter((product) => {
        const haystack = product.searchTokens ?? [];
        return words.every((word) => haystack.includes(word));
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const truncated = snap.docs.length >= SEARCH_QUERY_LIMIT;
    const visible = truncated ? matches.slice(0, SEARCH_QUERY_LIMIT - 1) : matches;
    return { products: visible, truncated };
  }

  async listModelGroups(): Promise<readonly string[]> {
    const products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(
      this.#productConverter,
    );
    const snap = await getDocs(query(products, where('modelGroup', '!=', null)));
    const groups = new Set<string>();
    for (const docSnap of snap.docs) {
      const group = docSnap.data().modelGroup;
      if (group) groups.add(group);
    }
    return [...groups].sort((left, right) => left.localeCompare(right));
  }

  async listAllCategories(): Promise<readonly Category[]> {
    const categories = collection(this.#firestore, CATEGORIES_COLLECTION).withConverter(
      createValibotConverter(CategorySchema),
    );
    const snap = await getDocs(query(categories, orderBy('sortOrder', 'asc'), limit(100)));
    return snap.docs.map((item) => item.data());
  }

  async listAllBrands(): Promise<readonly Brand[]> {
    const brands = collection(this.#firestore, BRANDS_COLLECTION).withConverter(
      createValibotConverter(BrandSchema),
    );
    const snap = await getDocs(query(brands, orderBy('sortOrder', 'asc'), limit(100)));
    return snap.docs.map((item) => item.data());
  }

  async countSearchSyncErrors(): Promise<number> {
    const snap = await getCountFromServer(collection(this.#firestore, 'searchSyncErrors'));
    return snap.data().count;
  }

  async getProduct(id: string): Promise<Product | null> {
    const ref = doc(this.#firestore, PRODUCTS_COLLECTION, id).withConverter(this.#productConverter);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async saveProduct(original: Product, next: ProductEditDraft): Promise<boolean> {
    const ref = doc(this.#firestore, PRODUCTS_COLLECTION, original.id).withConverter(
      this.#productConverter,
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('This product no longer exists. Reload the page.');
    }
    const fresh = snap.data();

    const changes: Record<string, string | boolean | null | readonly string[]> = {};
    const locked: string[] = [];

    if (next.type !== original.type && next.type !== fresh.type) {
      changes['type'] = next.type;
      locked.push('type');
    }

    const categoryUserChanged =
      next.categoryId !== original.categoryId ||
      !sameStringList(next.categoryIds, original.categoryIds);
    const categoryDiffersFromDb =
      next.categoryId !== fresh.categoryId ||
      !sameStringList(next.categoryIds, fresh.categoryIds);
    if (next.categoryPicked || (categoryUserChanged && categoryDiffersFromDb)) {
      changes['categoryId'] = next.categoryId;
      changes['categoryIds'] = [...next.categoryIds];
      if (next.categoryPicked) locked.push('categoryIds');
    }

    if (next.brandId !== original.brandId && next.brandId !== fresh.brandId) {
      changes['brandId'] = next.brandId;
      locked.push('brandId');
    }
    if (
      (next.modelGroup ?? '') !== (original.modelGroup ?? '') &&
      (next.modelGroup ?? '') !== (fresh.modelGroup ?? '')
    ) {
      changes['modelGroup'] = next.modelGroup;
      locked.push('modelGroup');
      changes['searchTokens'] = buildSearchTokens(fresh.name, next.modelGroup);
    }
    if (
      !sameStringList(next.colors, original.colors ?? []) &&
      !sameStringList(next.colors, fresh.colors ?? [])
    ) {
      changes['colors'] = [...next.colors];
      locked.push('colors');
    }
    if (
      !sameStringList(next.tags, original.tags ?? []) &&
      !sameStringList(next.tags, fresh.tags ?? [])
    ) {
      changes['tags'] = [...next.tags];
      locked.push('tags');
    }
    if (next.published !== original.published && next.published !== fresh.published) {
      changes['published'] = next.published;
      locked.push('published');
    }
    if (Object.keys(changes).length === 0) return false;

    await updateDoc(doc(this.#firestore, PRODUCTS_COLLECTION, original.id), {
      ...changes,
      ...(locked.length > 0 ? { lockedFields: arrayUnion(...locked) } : {}),
      updatedAt: serverTimestamp(),
    });
    return true;
  }
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}
