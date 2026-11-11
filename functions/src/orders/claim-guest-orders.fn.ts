import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import {
  confirmedClaimEmail,
  isClaimableGuestOrder,
  MAX_GUEST_ORDERS_PER_CLAIM,
} from './guest-order-claim.js';

export interface ClaimGuestOrdersResponse {
  /** How many guest orders this call linked to the caller's account. */
  readonly linked: number;
}

/**
 * Links the caller's earlier guest orders to their account: every order with no owner whose
 * `customerEmail` is the caller's confirmed email (at most 50 per call) gets `customerId` and
 * `claimedAt`. Signed-in callers only (App Check through `requireRole`). An unconfirmed email links
 * nothing and returns 0, because anyone can type any address when they create an account. Orders
 * that already belong to an account are never moved. The website calls it once per sign-in.
 */
export const claimGuestOrdersByEmail = onCall(
  adminCallableOptions(),
  async (request): Promise<ClaimGuestOrdersResponse> => {
    const caller = await requireRole(request, 'user');
    const email = confirmedClaimEmail(caller);
    if (!email) return { linked: 0 };

    const db = getFirestore();
    const query = db
      .collection('orders')
      .where('customerId', '==', null)
      .where('customerEmail', '==', email)
      .limit(MAX_GUEST_ORDERS_PER_CLAIM);

    const linked = await db.runTransaction(async (tx) => {
      const snap = await tx.get(query);
      const now = FieldValue.serverTimestamp();
      let count = 0;
      for (const doc of snap.docs) {
        if (!isClaimableGuestOrder(doc.data(), email)) continue;
        tx.update(doc.ref, { customerId: caller.uid, claimedAt: now, updatedAt: now });
        count += 1;
      }
      return count;
    });
    return { linked };
  },
);
