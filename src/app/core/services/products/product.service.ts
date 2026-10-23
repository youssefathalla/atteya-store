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
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { PRODUCTS_COLLECTION } from './product.constants';
import type { Product, ProductCountQuery, ProductListQuery } from './product.model';
import { ProductSchema } from './product.schema';

/**
 * Public catalogue reads. Every query includes published == true so Firestore rules allow it.
 * Pass at most one of category, type, or brand. The composite indexes cover that shape.
 */
@Service()
export class ProductService {
  readonly #firestore = injectFirestore();
  readonly #products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(
    createValibotConverter(ProductSchema),
  );

  async listPublished(listQuery: ProductListQuery): Promise<readonly Product[]> {
    const snap = await getDocs(query(this.#products, ...publishedFilters(listQuery), orderBy('createdAt', 'desc'), limit(listQuery.limit)));
    return snap.docs.map((item) => item.data());
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

  async listModelGroup(modelGroup: string, excludeId: string, max = 8): Promise<readonly Product[]> {
    const snap = await getDocs(
      query(
        this.#products,
        where('published', '==', true),
        where('modelGroup', '==', modelGroup),
        limit(max + 1),
      ),
    );
    return snap.docs
      .map((item) => item.data())
      .filter((product) => product.id !== excludeId)
      .slice(0, max);
  }

  async countPublished(countQuery: ProductCountQuery): Promise<number> {
    const snap = await getCountFromServer(query(this.#products, ...publishedFilters(countQuery)));
    return snap.data().count;
  }
}

function publishedFilters(countQuery: ProductCountQuery): QueryConstraint[] {
  const filters: QueryConstraint[] = [where('published', '==', true)];
  if (countQuery.category) filters.push(where('category', '==', countQuery.category));
  if (countQuery.type) filters.push(where('type', '==', countQuery.type));
  if (countQuery.brand) filters.push(where('brand', '==', countQuery.brand));
  return filters;
}
