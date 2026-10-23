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
  updateDoc,
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
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type { ProductEditDraft } from '../models/product-admin.model';

@Service()
export class ProductsAdminService {
  readonly #firestore = injectFirestore();

  async listProducts(): Promise<readonly Product[]> {
    const products = collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(
      createValibotConverter(ProductSchema),
    );
    const snap = await getDocs(query(products, orderBy('name'), limit(500)));
    return snap.docs.map((item) => item.data());
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
    const ref = doc(this.#firestore, PRODUCTS_COLLECTION, id).withConverter(
      createValibotConverter(ProductSchema),
    );
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async saveProduct(original: Product, next: ProductEditDraft): Promise<boolean> {
    const ref = doc(this.#firestore, PRODUCTS_COLLECTION, original.id).withConverter(
      createValibotConverter(ProductSchema),
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('This product no longer exists. Reload the page.');
    }
    const fresh = snap.data();

    const changes: Record<string, string | boolean | null | readonly string[]> = {};
    const locked: string[] = [];

    // Only persist fields the user edited in the dialog (vs `original`) and that still differ from Firestore (`fresh`).
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
