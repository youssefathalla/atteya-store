import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { isOrderViewKey, ORDER_VIEWS_COLLECTION, orderViewFields } from './order-view.js';

/**
 * Keeps `orderViews/{viewKey}` in step with every write of a guest order (an order with a
 * `viewKey`), so a guest can follow their order live with the key from their link. A deleted order
 * (or one whose key changed) loses its old view. Signed-in orders have no key and no view.
 */
export const syncOrderView = onDocumentWritten(
  { document: 'orders/{orderId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const beforeKey = isOrderViewKey(before?.['viewKey']) ? before['viewKey'] : null;
    const afterKey = after && isOrderViewKey(after['viewKey']) ? after['viewKey'] : null;
    const views = getFirestore().collection(ORDER_VIEWS_COLLECTION);
    const writes: Promise<unknown>[] = [];
    if (beforeKey && beforeKey !== afterKey) writes.push(views.doc(beforeKey).delete());
    if (after && afterKey) writes.push(views.doc(afterKey).set(orderViewFields(event.params.orderId, after)));
    await Promise.all(writes);
  },
);
