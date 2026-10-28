import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';

const PROOF_PATH = /^orders\/[A-Za-z0-9]{20}\/proof\.(jpg|jpeg|png|webp|avif)$/;

export interface RegisterOrderPaymentProofResponse {
  readonly orderId: string;
  readonly paymentProofPath: string;
}

export const registerOrderPaymentProof = onCall(
  adminCallableOptions(),
  async (request): Promise<RegisterOrderPaymentProofResponse> => {
    const caller = await requireRole(request, 'user');
    const { orderId, storagePath } = parseRequest(request.data);
    if (!PROOF_PATH.test(storagePath) || !storagePath.startsWith(`orders/${orderId}/`)) {
      throw new HttpsError('invalid-argument', 'That payment proof could not be saved.');
    }
    const db = getFirestore();
    const ref = db.collection('orders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'This order no longer exists.');
    }
    const data = snap.data() ?? {};
    if (data['customerId'] !== caller.uid) {
      throw new HttpsError('permission-denied', "You can't update this order.");
    }
    if (data['status'] !== 'pending') {
      throw new HttpsError('failed-precondition', 'This order is no longer waiting for payment.');
    }
    await ref.update({
      paymentProofPath: storagePath,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { orderId, paymentProofPath: storagePath };
  },
);

function parseRequest(data: unknown): { orderId: string; storagePath: string } {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'That payment proof could not be saved.');
  }
  const record = data as Record<string, unknown>;
  const orderId = record['orderId'];
  const storagePath = record['storagePath'];
  if (typeof orderId !== 'string' || orderId.length < 4 || orderId.length > 80) {
    throw new HttpsError('invalid-argument', 'That payment proof could not be saved.');
  }
  if (typeof storagePath !== 'string' || storagePath.length < 8 || storagePath.length > 200) {
    throw new HttpsError('invalid-argument', 'That payment proof could not be saved.');
  }
  return { orderId, storagePath };
}
