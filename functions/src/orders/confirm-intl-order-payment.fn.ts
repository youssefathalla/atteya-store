import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';

export interface ConfirmIntlOrderPaymentRequest {
  readonly orderId: string;
}

export interface ConfirmIntlOrderPaymentResponse {
  readonly orderId: string;
  readonly status: 'confirmed';
}

export const confirmInternationalOrderPayment = onCall(
  adminCallableOptions(),
  async (request): Promise<ConfirmIntlOrderPaymentResponse> => {
    const admin = await requireRole(request, 'admin');
    const orderId = readOrderId(request.data);
    const db = getFirestore();
    const ref = db.collection('orders').doc(orderId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'This order no longer exists.');
      }
      const data = snap.data() ?? {};
      if (data['paymentMethod'] !== 'international-bank-transfer') {
        throw new HttpsError('failed-precondition', 'This order cannot be confirmed this way.');
      }
      if (data['status'] === 'confirmed') {
        return;
      }
      if (data['status'] !== 'pending') {
        throw new HttpsError('failed-precondition', 'This order is not waiting for payment.');
      }
      tx.update(ref, {
        status: 'confirmed',
        confirmedAt: FieldValue.serverTimestamp(),
        confirmedBy: admin.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { orderId, status: 'confirmed' };
  },
);

function readOrderId(data: unknown): string {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Choose an order to confirm.');
  }
  const orderId = (data as Record<string, unknown>)['orderId'];
  if (typeof orderId !== 'string' || orderId.length < 4 || orderId.length > 80) {
    throw new HttpsError('invalid-argument', 'Choose an order to confirm.');
  }
  return orderId;
}
