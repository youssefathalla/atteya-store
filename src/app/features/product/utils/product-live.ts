import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { PRODUCTS_COLLECTION, ProductSchema, type Product } from '@core/services/products';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';

const converter = createValibotConverter(ProductSchema);

/**
 * Live product doc for the open product page. Browser only: the caller starts it after hydration.
 * Product = latest server copy of a published doc. null = unpublished or deleted
 * (shoppers get permission-denied; admins see published false or a missing doc).
 * Cache-only snapshots, schema failures and other errors are skipped, so the page keeps its last good value.
 * Lives here, not in ProductService, so onSnapshot stays out of the main bundle.
 */
export function watchProductDoc(
  firestore: Firestore,
  id: string,
  next: (product: Product | null) => void,
): () => void {
  return onSnapshot(
    doc(firestore, PRODUCTS_COLLECTION, id).withConverter(converter),
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache) return; // offline or cache-first: keep what is on screen
      if (!snap.exists()) {
        next(null);
        return;
      }
      let product: Product;
      try {
        product = snap.data();
      } catch {
        return; // doc fails ProductSchema: keep the last good value
      }
      next(product.published ? product : null);
    },
    (error) => {
      if (isPermissionDenied(error)) next(null);
    },
  );
}
