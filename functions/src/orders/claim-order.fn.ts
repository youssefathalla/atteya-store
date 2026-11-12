import { timingSafeEqual } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireAcceptedTerms } from '../auth/require-accepted-terms.js';
import { requireRole } from '../auth/require-role.js';
import { isGuestOrder } from './guest-order-claim.js';
import { claimEmailMatches, isOrderViewKey } from './order-view.js';

export interface ClaimOrderResponse {
  readonly orderId: string;
  readonly claimed: true;
}

const NOT_FOUND = "We couldn't find that order. Check the link in your order email.";

/**
 * Links a guest order to the signed-in caller's account. The caller needs both the order's secret
 * `viewKey` (from the order link) and an account email equal to the email on the order, so a
 * forwarded or leaked link can't move the order to someone else's account. Sets `customerId` (and `claimedAt`) only while the
 * order has no owner; an order that already belongs to another account is refused. Calling again
 * for the same account changes nothing. Like placing an order, it needs an account that accepted
 * the terms, and only a guest order (one with the `guest` terms block) can be claimed.
 */
export const claimOrder = onCall(adminCallableOptions(), async (request): Promise<ClaimOrderResponse> => {
  const caller = await requireRole(request, 'user');
  // Owning an order needs an account that agreed to the terms (same as claimGuestOrdersByEmail).
  await requireAcceptedTerms(caller.uid);
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
    // Only guest checkout orders can be linked; any other order answers as if it didn't exist.
    if (!snap.exists || !order || !sameKey(order['viewKey'], viewKey) || !isGuestOrder(order)) {
      throw new HttpsError('not-found', NOT_FOUND);
    }
    const owner = order['customerId'];
    if (owner === caller.uid) return;
    if (typeof owner === 'string' && owner.length > 0) {
      throw new HttpsError('failed-precondition', 'This order is already linked to another account.');
    }
    // An unverified token email can be any address the caller typed at sign-up, so it proves nothing.
    if (!caller.emailVerified || !claimEmailMatches(order['customerEmail'], caller.email)) {
      throw new HttpsError(
        'permission-denied',
        'Sign in with the verified email you used for this order to save it to your account.',
      );
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
