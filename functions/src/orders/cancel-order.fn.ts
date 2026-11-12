import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { changeOrderStatus } from './order-status-change.js';

export interface CancelOrderResponse {
  readonly orderId: string;
  readonly status: 'cancelled';
  /** False when the order was already cancelled. */
  readonly changed: boolean;
}

/**
 * Admin cancel for open orders that were never paid: cash on delivery (shipping fee not
 * received) and InstaPay (transfer never arrived). Kept as a thin wrapper over
 * `changeOrderStatus` (the status dropdown's code), limited to pending orders as before: the
 * offer uses the order took (`offerUses`) go back once (`offerUsesReturnedAt`), and stock goes
 * back only if it had been taken (`stockDecrementedAt`).
 *
 * Card (Paymob) orders are refused: `paymobWebhook` treats `cancelled` as final and would
 * ignore a payment that clears later.
 */
export const cancelOrder = onCall(adminCallableOptions(), async (request): Promise<CancelOrderResponse> => {
  const actor = await requireRole(request, 'staff');
  const orderId = parseOrderId(request.data);
  const result = await changeOrderStatus(getFirestore(), orderId, 'cancelled', actor, {
    idempotent: true,
    onlyFrom: ['pending'],
    onlyFromMessage: "Only open orders that haven't been paid can be cancelled.",
  });
  return { orderId, status: 'cancelled', changed: result.changed };
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
