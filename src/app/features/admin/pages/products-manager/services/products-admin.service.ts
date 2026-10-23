import { Service } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import {
  CATALOG_BRAND_IDS,
  CATALOG_CATEGORY_IDS,
  CATALOG_DOC,
  PRODUCTS_COLLECTION,
  PRODUCT_TYPE_IDS,
} from '@core/services/products/product.constants';
import type { Product } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type { ProductEditDraft } from '../models/product-admin.model';
import { categoryForProductType } from '../utils/product-admin.utils';

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

  async saveProduct(current: Product, next: ProductEditDraft): Promise<boolean> {
    const changes: Record<string, string | boolean | null> = {};
    const locked: string[] = [];

    if (next.type !== current.type) {
      changes['type'] = next.type;
      changes['category'] = categoryForProductType(next.type);
      locked.push('type');
    }
    if (next.brand !== current.brand) {
      changes['brand'] = next.brand;
      locked.push('brand');
    }
    if ((next.modelGroup ?? '') !== (current.modelGroup ?? '')) {
      changes['modelGroup'] = next.modelGroup;
      locked.push('modelGroup');
    }
    if (next.published !== current.published) {
      changes['published'] = next.published;
      locked.push('published');
    }
    if (locked.length === 0) return false;

    await updateDoc(doc(this.#firestore, PRODUCTS_COLLECTION, current.id), {
      ...changes,
      lockedFields: arrayUnion(...locked),
      updatedAt: serverTimestamp(),
    });
    await this.refreshCatalog();
    return true;
  }

  async refreshCatalog(): Promise<void> {
    const products = collection(this.#firestore, PRODUCTS_COLLECTION);
    const [categories, types, brands, totalSnap] = await Promise.all([
      countMap(products, 'category', CATALOG_CATEGORY_IDS),
      countMap(products, 'type', PRODUCT_TYPE_IDS),
      countMap(products, 'brand', CATALOG_BRAND_IDS),
      getCountFromServer(query(products, where('published', '==', true))),
    ]);

    await setDoc(
      doc(this.#firestore, CATALOG_DOC[0], CATALOG_DOC[1]),
      {
        categories,
        types,
        brands,
        total: totalSnap.data().count,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}

async function countMap(
  products: ReturnType<typeof collection>,
  field: 'category' | 'type' | 'brand',
  ids: readonly string[],
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const snap = await getCountFromServer(
        query(products, where('published', '==', true), where(field, '==', id)),
      );
      return [id, snap.data().count] as const;
    }),
  );
  return Object.fromEntries(entries);
}
