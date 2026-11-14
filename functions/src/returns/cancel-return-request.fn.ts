import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions, requireAppCheck } from '../auth/callable-options.js';
import { isReturnStatus, nextReturnStatuses, withReturnStatus } from '../store/returns.js';
import { isOrderShopper, RETURN_REQUESTS_COLLECTION } from './return-access.js';

export interface CancelReturnRequestResponse {
  readonly requestId: string;
  readonly status: 'cancelled';
  /** False when the request was already cancelled. */
  readonly changed: boolean;
}

const NOT_FOUND = "We couldn't find that request. Check the link in your order email.";

/**
 * The shopper cancels their own return or exchange request while it is still Requested
 * (ATS-291). Same owner check as `requestReturn` (uid, or the order's `viewKey`). Updates the
 * request and its entry in the order's `returns` summary in one transaction and sends nothing.
 */
export const cancelReturnRequest = onCall(
  adminCallableOptions(),
  async (request): Promise<CancelReturnRequestResponse> => {
    requireAppCheck(request);
    const data = isRecord(request.data) ? request.data : {};
    const requestId = data['requestId'];
    const viewKeyRaw = data['viewKey'];
    const viewKey = typeof viewKeyRaw === 'string' && viewKeyRaw.length > 0 ? viewKeyRaw : null;
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(requestId)) {
      throw new HttpsError('invalid-argument', NOT_FOUND);
    }

    const db = getFirestore();
    const requestRef = db.collection(RETURN_REQUESTS_COLLECTION).doc(requestId);
    const changed = await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      const saved = requestSnap.data();
      const orderId = saved?.['orderId'];
      if (!requestSnap.exists || !saved || typeof orderId !== 'string' || !orderId || orderId.includes('/')) {
        throw new HttpsError('not-found', NOT_FOUND);
      }
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await tx.get(orderRef);
      const order = orderSnap.data();
      if (!orderSnap.exists || !order || !isOrderShopper(order, request, viewKey)) {
        throw new HttpsError('not-found', NOT_FOUND);
      }
      const status = saved['status'];
      if (status === 'cancelled') return false;
      if (
        !isReturnStatus(status) ||
        !nextReturnStatuses(status, saved['hasRefund'] === true, true).includes('cancelled')
      ) {
        throw new HttpsError(
          'failed-precondition',
          'This request is already being handled, so it can no longer be cancelled. Please message us on WhatsApp.',
        );
      }

      const now = FieldValue.serverTimestamp();
      tx.update(requestRef, {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: 'shopper',
        updatedAt: now,
      });
      tx.update(orderRef, { returns: withReturnStatus(order['returns'], requestId, 'cancelled') });
      return true;
    });
    return { requestId, status: 'cancelled', changed };
  },
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
