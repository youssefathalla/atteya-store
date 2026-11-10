import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { isOrderViewKey, ORDER_VIEWS_COLLECTION, orderViewFields } from './order-view.js';

/**
 * Keeps `orderViews/{viewKey}` in step with every write of a guest order (an order with a
 * `viewKey`), so a guest can follow their order live with the key from their link. A deleted order
 * (or one whose key changed) loses its old view. Signed-in orders have no key and no view.
 *
 * Triggers can arrive out of order (an order create handled after the Paymob confirm), so the view
 * is written from the order as it is now, never from the event's `after` snapshot. Every run
 * writes the same result for the same order state, so retries are safe.
 */
export const syncOrderView = onDocumentWritten(
  { document: 'orders/{orderId}', region: 'europe-west3', retry: true },
  async (event) => {
    const db = getFirestore();
    const orderId = event.params.orderId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const eventKeys = [before?.['viewKey'], after?.['viewKey']].filter(isOrderViewKey);
    if (eventKeys.length === 0) return;

    const views = db.collection(ORDER_VIEWS_COLLECTION);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(db.collection('orders').doc(orderId));
      const current = snap.data();
      const currentKey = current && isOrderViewKey(current['viewKey']) ? current['viewKey'] : null;
      for (const key of new Set(eventKeys)) {
        if (key !== currentKey) tx.delete(views.doc(key));
      }
      if (current && currentKey) tx.set(views.doc(currentKey), orderViewFields(orderId, current));
    });
  },
);
