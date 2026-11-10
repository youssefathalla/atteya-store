import { timingSafeEqual } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { isOrderViewKey } from './order-view.js';

export interface ClaimOrderResponse {
  readonly orderId: string;
  readonly claimed: true;
}

const NOT_FOUND = "We couldn't find that order. Check the link in your order email.";

/**
 * Links a guest order to the signed-in caller's account. The caller proves they hold the order by
 * its secret `viewKey` (from the order link). Sets `customerId` (and `claimedAt`) only while the
 * order has no owner; an order that already belongs to another account is refused. Calling again
 * for the same account changes nothing.
 */
export const claimOrder = onCall(adminCallableOptions(), async (request): Promise<ClaimOrderResponse> => {
  const caller = await requireRole(request, 'user');
  const data =
    typeof request.data === 'object' && request.data !== null
      ? (request.data as Record<string, unknown>)
      : {};
  const orderId = data['orderId'];
  const viewKey = data['viewKey'];
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(orderId) || !isOrderViewKey(viewKey)) {
    throw new HttpsError('invalid-argument', NOT_FOUND);
  }

  const db = getFirestore();
  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    const order = snap.data();
    if (!snap.exists || !order || !sameKey(order['viewKey'], viewKey)) {
      throw new HttpsError('not-found', NOT_FOUND);
    }
    const owner = order['customerId'];
    if (owner === caller.uid) return;
    if (typeof owner === 'string' && owner.length > 0) {
      throw new HttpsError('failed-precondition', 'This order is already linked to another account.');
    }
    const now = FieldValue.serverTimestamp();
    tx.update(orderRef, { customerId: caller.uid, claimedAt: now, updatedAt: now });
  });
  return { orderId, claimed: true };
});

/** Constant-time comparison of the stored key with the one the caller sent. */
function sameKey(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string') return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
