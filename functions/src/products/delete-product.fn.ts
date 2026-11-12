import { FieldPath, FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
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

    // Cash on Delivery, InstaPay and Bank Transfer orders take stock only when confirmed, and
    // confirming refuses when a product is gone: keep the product while such an order needs it.
    // Checked before the transaction, so it never read-locks the open orders (abandoned card orders
    // stay Waiting for Payment and pile up) and never makes the Paymob webhook or a status change wait.
    if (await unconfirmedOrderNeedsProduct(db, productId)) {
      throw new HttpsError(
        'failed-precondition',
        'An open order still has this product and needs it to be confirmed. Confirm or cancel that order first.',
      );
    }

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

const PENDING_PAGE_SIZE = 500;

/**
 * Pages through Waiting for Payment orders by document id (no composite index needed), reading only
 * the fields the check uses, and stops at the first unconfirmed manual-payment order with the product.
 */
async function unconfirmedOrderNeedsProduct(db: Firestore, productId: string): Promise<boolean> {
  let query = db
    .collection('orders')
    .where('status', '==', 'pending')
    .orderBy(FieldPath.documentId())
    .select('status', 'paymentMethod', 'stockDecrementedAt', 'pricing.lines')
    .limit(PENDING_PAGE_SIZE);
  for (;;) {
    const page = await query.get();
    const found = page.docs.some((doc) => {
      const order = doc.data();
      return (
        isManualPayment(order['paymentMethod']) &&
        !orderStockTaken(order) &&
        orderHasProduct(order, productId)
      );
    });
    if (found) return true;
    if (page.size < PENDING_PAGE_SIZE) return false;
    query = query.startAfter(page.docs[page.size - 1]!);
  }
}

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
