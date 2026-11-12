import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';

export interface SetDeliveryFeeResponse {
  readonly orderId: string;
  readonly feeEgp: number;
  readonly totalEgp: number;
}

/** Highest delivery fee staff can save, in whole EGP. */
const MAX_FEE_EGP = 100_000;

/**
 * Admin: save the delivery fee agreed with the shopper on WhatsApp for a large Egypt order
 * (`pricing.shipping.kind === 'domestic-agreed'`, InstaPay or Cash on Delivery). Sets the shipping
 * line and the order total, so the confirmation page and `paymentDue()` ask for the right amount.
 * Can be changed again while the order is still open. The first save emails the shopper
 * (`delivery-fee-set`); each later change emails the new fee (`delivery-fee-changed`). Stock is
 * not touched: that still happens on confirm.
 */
export const setDeliveryFee = onCall(
  adminCallableOptions(),
  async (request): Promise<SetDeliveryFeeResponse> => {
    const actor = await requireRole(request, 'staff');
    const { orderId, feeEgp } = parseInput(request.data);
    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'That order could not be found.');
      }
      const order = snap.data() ?? {};
      const method = order['paymentMethod'];
      if (method !== 'cash-on-delivery' && method !== 'instapay') {
        throw new HttpsError(
          'failed-precondition',
          'The delivery fee can only be set on InstaPay or Cash on Delivery orders.',
        );
      }
      if (order['status'] !== 'pending') {
        throw new HttpsError(
          'failed-precondition',
          'The delivery fee can only be set while the order is still open.',
        );
      }
      const pricing = isRecord(order['pricing']) ? order['pricing'] : null;
      const shipping = pricing && isRecord(pricing['shipping']) ? pricing['shipping'] : null;
      if (!pricing || !shipping || shipping['kind'] !== 'domestic-agreed') {
        throw new HttpsError('failed-precondition', 'This order already has its delivery fee from checkout.');
      }
      const subtotalEgp = pricing['subtotalEgp'];
      if (typeof subtotalEgp !== 'number' || !Number.isInteger(subtotalEgp) || subtotalEgp < 0) {
        throw new HttpsError('failed-precondition', "This order's amounts can't be read.");
      }

      const totalEgp = subtotalEgp + feeEgp;
      const now = FieldValue.serverTimestamp();
      tx.update(orderRef, {
        'pricing.shipping.priceEgp': feeEgp,
        'pricing.shipping.priceDisplay': feeEgp,
        'pricing.shipping.feeAgreed': true,
        'pricing.totalEgp': totalEgp,
        'pricing.totalDisplay': totalEgp,
        deliveryFeeSetAt: now,
        deliveryFeeSetBy: actor.uid,
        updatedAt: now,
      });
      return { orderId, feeEgp, totalEgp };
    });
  },
);

function parseInput(raw: unknown): { orderId: string; feeEgp: number } {
  if (!isRecord(raw)) {
    throw new HttpsError('invalid-argument', 'Choose an order and enter a delivery fee.');
  }
  const orderId = raw['orderId'];
  if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 200 || orderId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Choose an order.');
  }
  const feeEgp = raw['feeEgp'];
  if (typeof feeEgp !== 'number' || !Number.isInteger(feeEgp) || feeEgp < 0 || feeEgp > MAX_FEE_EGP) {
    throw new HttpsError('invalid-argument', 'Enter the delivery fee in whole pounds, from 0 to 100,000.');
  }
  return { orderId, feeEgp };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
