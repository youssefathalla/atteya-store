import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { readDocIdRequest } from '../orders/order-delete.js';

export interface DeleteProductResponse {
  readonly productId: string;
  /** False when the product was already gone. */
  readonly deleted: boolean;
}

/**
 * Admin or staff: deletes one product doc (one colour of a model) and writes an `auditLogs` record.
 * The product triggers follow on their own: `syncProductSearch` removes it from search,
 * `onProductColorSiblingsChange` drops it from the other colours' cards and `onProductCountsChange`
 * updates the menu counts. Photos stay in Storage (files may be shared). Bags, favourites and offers
 * keep the id and show it as no longer available; orders keep their saved copy.
 */
export const deleteProduct = onCall(
  adminCallableOptions(),
  async (request): Promise<DeleteProductResponse> => {
    const actor = await requireRole(request, 'staff');
    const productId = readDocIdRequest(request.data, 'productId');
    if (!productId) throw new HttpsError('invalid-argument', 'Choose a product and try again.');

    const db = getFirestore();
    const ref = db.collection('products').doc(productId);
    const auditRef = db.collection('auditLogs').doc();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { productId, deleted: false };
      const data = snap.data() ?? {};
      tx.delete(ref);
      tx.set(auditRef, {
        action: 'product.delete',
        productId,
        name: typeof data['name'] === 'string' ? data['name'] : null,
        slug: typeof data['slug'] === 'string' ? data['slug'] : null,
        modelGroup: typeof data['modelGroup'] === 'string' ? data['modelGroup'] : null,
        actorUid: actor.uid,
        actorEmail: actor.email ?? actor.uid,
        at: FieldValue.serverTimestamp(),
      });
      return { productId, deleted: true };
    });
  },
);
