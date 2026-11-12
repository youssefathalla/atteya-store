import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { readDocIdRequest } from '../orders/order-delete.js';
import { isManualPayment, orderStockTaken } from '../store/order-status.js';

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
      // Cash on Delivery, InstaPay and Bank Transfer orders take stock only when confirmed, and
      // confirming refuses when a product is gone: keep the product while such an order needs it.
      const pending = await tx.get(db.collection('orders').where('status', '==', 'pending'));
      const blockingOrder = pending.docs.find((doc) => {
        const order = doc.data();
        return (
          isManualPayment(order['paymentMethod']) &&
          !orderStockTaken(order) &&
          orderHasProduct(order, productId)
        );
      });
      if (blockingOrder) {
        throw new HttpsError(
          'failed-precondition',
          'An open order still has this product and needs it to be confirmed. Confirm or cancel that order first.',
        );
      }
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

function orderHasProduct(order: Record<string, unknown>, productId: string): boolean {
  const pricing = order['pricing'];
  if (typeof pricing !== 'object' || pricing === null || Array.isArray(pricing)) return false;
  const lines = (pricing as Record<string, unknown>)['lines'];
  if (!Array.isArray(lines)) return false;
  return lines.some(
    (line) =>
      typeof line === 'object' &&
      line !== null &&
      (line as Record<string, unknown>)['productId'] === productId,
  );
}
