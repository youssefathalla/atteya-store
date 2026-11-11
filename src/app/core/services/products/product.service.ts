import { Service } from '@angular/core';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { PRODUCTS_COLLECTION } from './product.constants';
import type { Product, ProductCountQuery, ProductListQuery } from './product.model';
import { ProductSchema } from './product.schema';
import {
  mergeNewArrivalPool,
  NEW_ARRIVAL_FLAGGED_FETCH,
  NEW_ARRIVALS_LIMIT,
  timestampToMs,
} from './utils/new-arrival';
import { onePerModel } from './utils/one-per-model';

/**
 * Public catalogue reads. Every query includes published == true so Firestore rules allow it.
 * Pass at most one of categoryId, type, or brandId. The composite indexes cover that shape.
 */
@Service()
export class ProductService {
  readonly #firestore = injectFirestore();
  readonly #products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(
    createValibotConverter(ProductSchema),
  );

  async listPublished(listQuery: ProductListQuery): Promise<readonly Product[]> {
    const snap = await getDocs(
      query(
        this.#products,
        ...publishedFilters(listQuery),
        orderBy('createdAt', 'desc'),
        limit(listQuery.limit),
      ),
    );
    return snap.docs.map((item) => item.data());
  }

  /**
   * Homepage New Arrivals: unexpired `newArrivalUntil` first (most recently
   * updated), then newest published by `createdAt`, capped at `max` (the row size).
   */
  async listNewArrivals(max = NEW_ARRIVALS_LIMIT): Promise<readonly Product[]> {
    const now = Timestamp.now();
    const [flaggedSnap, newest] = await Promise.all([
      getDocs(
        query(
          this.#products,
          where('published', '==', true),
          where('newArrivalUntil', '>', now),
          orderBy('newArrivalUntil', 'asc'),
          limit(NEW_ARRIVAL_FLAGGED_FETCH),
        ),
      ),
      // Extra newest products, so the row is still full after other colours of a model are dropped.
      this.listPublished({ limit: max * 3 }),
    ]);
    const flagged = flaggedSnap.docs.map((item) => item.data());
    const pool = mergeNewArrivalPool(
      flagged,
      newest,
      (product) => timestampToMs(product.updatedAt) ?? 0,
      max * 3,
    );
    return onePerModel(pool).slice(0, max);
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const snap = await getDocs(
      query(this.#products, where('published', '==', true), where('slug', '==', slug), limit(1)),
    );
    return snap.docs[0]?.data() ?? null;
  }

  async getById(id: string): Promise<Product | null> {
    try {
      const snap = await getDoc(doc(this.#products, id));
      return snap.exists() ? snap.data() : null;
    } catch (error: unknown) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
  }

  /**
   * Every published colour of one model, the open product included. No `orderBy`, so Firestore
   * returns them by document id: the same order on every product page of the group.
   */
  async listModelGroup(modelGroup: string, max = 9): Promise<readonly Product[]> {
    const snap = await getDocs(
      query(
        this.#products,
        where('published', '==', true),
        where('modelGroup', '==', modelGroup),
        limit(max),
      ),
    );
    return snap.docs.map((item) => item.data());
  }

  async countPublished(countQuery: ProductCountQuery): Promise<number> {
    const snap = await getCountFromServer(query(this.#products, ...publishedFilters(countQuery)));
    return snap.data().count;
  }
}

function publishedFilters(countQuery: ProductCountQuery): QueryConstraint[] {
  const filters: QueryConstraint[] = [where('published', '==', true)];
  if (countQuery.categoryId) filters.push(where('categoryIds', 'array-contains', countQuery.categoryId));
  if (countQuery.type) filters.push(where('type', '==', countQuery.type));
  if (countQuery.brandId) filters.push(where('brandId', '==', countQuery.brandId));
  return filters;
}
