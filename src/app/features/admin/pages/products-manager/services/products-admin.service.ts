import { inject, Service } from '@angular/core';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import * as v from 'valibot';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { BrandSchema, CategorySchema } from '@core/services/products/category.schema';
import {
  BRANDS_COLLECTION,
  CATEGORIES_COLLECTION,
  PRODUCTS_COLLECTION,
} from '@core/services/products/product.constants';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { ProductCacheService } from '@core/services/products/product-cache.service';
import { ProductSchema } from '@core/services/products/product.schema';
import {
  isSearchTooShort,
  longestSearchWord,
  matchesSearchWords,
  searchWordsFromTerm,
} from '@core/services/products/search-tokens';
import { SearchService } from '@core/services/search';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type {
  ProductModelVersions,
  SaveProductModelPayload,
  SaveProductModelResult,
  StockChange,
  StockResult,
} from '../models/product-admin.model';

const LIST_PAGE_SIZE = 500;
const SEARCH_QUERY_LIMIT = 201;
const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));

const StockResultSchema = v.object({
  stock: wholeNumber,
  stockBySize: v.nullable(v.record(v.string(), wholeNumber)),
  inStock: v.boolean(),
});

const nonEmpty = v.pipe(v.string(), v.minLength(1));

const ProductModelVersionsSchema = v.object({
  modelGroup: v.nullable(nonEmpty),
  colours: v.pipe(v.array(v.object({ id: nonEmpty, version: nonEmpty })), v.minLength(1)),
});

const SaveProductModelResultSchema = v.object({
  anchorId: nonEmpty,
  modelGroup: v.nullable(nonEmpty),
  colours: v.array(v.object({ id: nonEmpty, slug: v.string() })),
});

type SetStockPayload = { readonly productId: string } & StockChange;

export interface ProductSearchResult {
  readonly products: readonly Product[];
  readonly truncated: boolean;
}

@Service()
export class ProductsAdminService {
  readonly #firestore = injectFirestore();
  readonly #functions = injectFunctionsAsync();
  readonly #searchService = inject(SearchService);
  readonly #productCache = inject(ProductCacheService);
  readonly #productConverter = createValibotConverter(ProductSchema);

  newProductId(): string {
    return doc(collection(this.#firestore, PRODUCTS_COLLECTION)).id;
  }

  async listAllProducts(): Promise<readonly Product[]> {
    const products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(this.#productConverter);
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
    if (!anchor || isSearchTooShort(words)) {
      return { products: [], truncated: false };
    }

    const products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(this.#productConverter);
    const snap = await getDocs(
      query(products, where('searchTokens', 'array-contains', anchor), limit(SEARCH_QUERY_LIMIT)),
    );

    const matches = snap.docs
      .map((docSnap) => docSnap.data())
      .filter((product) => matchesSearchWords(product.searchTokens ?? [], words))
      .sort((left, right) => left.name.localeCompare(right.name));

    const truncated = snap.docs.length >= SEARCH_QUERY_LIMIT;
    const visible = truncated ? matches.slice(0, SEARCH_QUERY_LIMIT - 1) : matches;
    return { products: visible, truncated };
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

  /** The colours of the product that holds `productId`, with the version each save is checked against. */
  async getProductModel(productId: string): Promise<ProductModelVersions> {
    const read = await callableFrom<{ productId: string }, unknown>(this.#functions(), 'getProductModel');
    const result = await read({ productId });
    const parsed = v.safeParse(ProductModelVersionsSchema, result.data);
    if (!parsed.success) throw new Error('This product could not be loaded. Reload the page.');
    return parsed.output;
  }

  /** Save the product and every colour of it at once. */
  async saveProductModel(payload: SaveProductModelPayload): Promise<SaveProductModelResult> {
    const save = await callableFrom<SaveProductModelPayload, unknown>(this.#functions(), 'saveProductModel');
    const result = await save(payload);
    this.#productCache.clear();
    const parsed = v.safeParse(SaveProductModelResultSchema, result.data);
    if (!parsed.success) {
      throw new Error('The product was saved, but the response was unexpected. Reload the page.');
    }
    await this.#searchService.clearCache();
    return parsed.output;
  }

  async saveStock(productId: string, change: StockChange): Promise<StockResult> {
    const setStock = await callableFrom<SetStockPayload, unknown>(this.#functions(), 'setProductStock');
    const result = await setStock({ productId, ...change });
    const parsed = v.safeParse(StockResultSchema, result.data);
    if (!parsed.success) {
      throw new Error('Stock was saved, but the response was unexpected. Reload the page.');
    }
    await this.#searchService.clearCache();
    return parsed.output;
  }

  async setPublished(productId: string, published: boolean): Promise<boolean> {
    const setPublished = await callableFrom<{ productId: string; published: boolean }, unknown>(
      this.#functions(),
      'setProductPublished',
    );
    const result = await setPublished({ productId, published });
    const parsed = v.safeParse(v.object({ published: v.boolean() }), result.data);
    if (!parsed.success) {
      throw new Error('The change was saved, but the response was unexpected. Reload the page.');
    }
    await this.#searchService.clearCache();
    return parsed.output.published;
  }
}
