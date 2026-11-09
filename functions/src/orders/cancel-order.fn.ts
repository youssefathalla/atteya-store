import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';

export interface CancelOrderResponse {
  readonly orderId: string;
  readonly status: 'cancelled';
  /** False when the order was already cancelled. */
  readonly changed: boolean;
}

/**
 * Admin cancel for open orders that were never paid: cash on delivery (shipping fee not
 * received) and InstaPay (transfer never arrived). Stock is only taken when an order is
 * confirmed, so nothing goes back into stock.
 *
 * Card (Paymob) orders are refused: `paymobWebhook` treats `cancelled` as final and would
 * ignore a payment that clears later. Confirmed orders are refused too (money was received).
 */
export const cancelOrder = onCall(adminCallableOptions(), async (request): Promise<CancelOrderResponse> => {
  const actor = await requireRole(request, 'admin');
  const orderId = parseOrderId(request.data);
  const db = getFirestore();
  const orderRef = db.collection('orders').doc(orderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'That order could not be found.');
    }
    const order: DocumentData = snap.data() ?? {};
    if (order['status'] === 'cancelled') {
      return { orderId, status: 'cancelled' as const, changed: false };
    }
    const method = order['paymentMethod'];
    if (method !== 'cash-on-delivery' && method !== 'instapay') {
      throw new HttpsError(
        'failed-precondition',
        "Card or Wallet orders can't be cancelled here. They update on their own when the payment clears or fails.",
      );
    }
    if (order['status'] !== 'pending') {
      throw new HttpsError(
        'failed-precondition',
        "Only open orders that haven't been paid can be cancelled.",
      );
    }

    const now = FieldValue.serverTimestamp();
    tx.update(orderRef, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: actor.uid,
      updatedAt: now,
    });
    return { orderId, status: 'cancelled' as const, changed: true };
  });
});

function parseOrderId(raw: unknown): string {
  const orderId =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)['orderId']
      : undefined;
  if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 200 || orderId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Choose an order to cancel.');
  }
  return orderId;
}
