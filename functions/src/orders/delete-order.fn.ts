import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import {
  orderDeleteBlockedReason,
  paymobFailedDeleteBlockedReason,
  readDocIdRequest,
} from './order-delete.js';
import { orderStaffNotesRef } from './order-staff-notes.js';

export interface DeleteOrderResponse {
  readonly orderId: string;
  /** False when the order was already gone. */
  readonly deleted: boolean;
}

/**
 * Admin only (staff can't): deletes a Cancelled or Payment Failed order and its staff notes in one
 * transaction, and writes an `auditLogs` record of who deleted what. `syncOrderView` then removes
 * the guest view, and `sendOrderEmails` sends nothing for a delete. Saved `orderEmails` records stay.
 */
export const deleteOrder = onCall(adminCallableOptions(), async (request): Promise<DeleteOrderResponse> => {
  const actor = await requireRole(request, 'admin');
  const orderId = readDocIdRequest(request.data, 'orderId');
  if (!orderId) throw new HttpsError('invalid-argument', 'Choose an order and try again.');

  const db = getFirestore();
  const orderRef = db.collection('orders').doc(orderId);
  const auditRef = db.collection('auditLogs').doc();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { orderId, deleted: false };
    const order = snap.data() ?? {};
    const blocked = orderDeleteBlockedReason(order['status']);
    if (blocked) throw new HttpsError('failed-precondition', blocked);
    const createdAt = order['createdAt'];
    const tooSoon = paymobFailedDeleteBlockedReason(
      {
        status: order['status'],
        paymentMethod: order['paymentMethod'],
        createdAtMs: createdAt instanceof Timestamp ? createdAt.toMillis() : null,
      },
      Date.now(),
    );
    if (tooSoon) throw new HttpsError('failed-precondition', tooSoon);

    const pricing = typeof order['pricing'] === 'object' && order['pricing'] !== null ? order['pricing'] : {};
    const totalEgp = (pricing as Record<string, unknown>)['totalEgp'];
    tx.delete(orderRef);
    tx.delete(orderStaffNotesRef(db, orderId));
    tx.set(auditRef, {
      action: 'order.delete',
      orderId,
      status: order['status'],
      paymentMethod: typeof order['paymentMethod'] === 'string' ? order['paymentMethod'] : null,
      totalEgp: typeof totalEgp === 'number' ? totalEgp : null,
      customerEmail: typeof order['customerEmail'] === 'string' ? order['customerEmail'] : null,
      actorUid: actor.uid,
      actorEmail: actor.email ?? actor.uid,
      at: FieldValue.serverTimestamp(),
    });
    return { orderId, deleted: true };
  });
});
