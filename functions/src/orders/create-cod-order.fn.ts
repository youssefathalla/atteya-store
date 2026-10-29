import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { parseCreateStoreOrderRequest } from './order-request.js';
import { priceStoreOrder, type OrderPricingSnapshot } from './order-pricing.server.js';

const MAX_ORDERS_PER_UID_PER_UTC_DAY = 20;

export interface CreateCodOrderResponse {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: 'cash-on-delivery';
  readonly pricing: OrderPricingSnapshot;
}

/**
 * Egypt-only cash on delivery. Creates a pending order for fulfilment;
 * payment is collected at delivery (stock decrement still out of scope).
 */
export const createCodOrder = onCall(
  adminCallableOptions(),
  async (request): Promise<CreateCodOrderResponse> => {
    const caller = await requireRole(request, 'user');
    const input = parseCreateStoreOrderRequest({
      ...(isRecord(request.data) ? request.data : {}),
      paymentMethod: 'cash-on-delivery',
    });
    if (input.shipping.country !== 'EG') {
      throw new HttpsError(
        'failed-precondition',
        'Cash on delivery is only available for orders delivered in Egypt.',
      );
    }

    const db = getFirestore();
    const priced = await priceStoreOrder(db, input, true);
    const orderRef = db.collection('orders').doc();

    await db.runTransaction(async (tx) => {
      const day = utcDayKey();
      const rateLimitRef = db.collection('orderRateLimits').doc(`${caller.uid}_${day}`);
      const rateLimitSnap = await tx.get(rateLimitRef);
      const nextRateCount = nextDailyOrderCount(rateLimitSnap.data()?.['count']);
      const now = FieldValue.serverTimestamp();

      tx.set(
        rateLimitRef,
        {
          uid: caller.uid,
          day,
          count: nextRateCount,
          updatedAt: now,
        },
        { merge: true },
      );
      tx.set(orderRef, {
        id: orderRef.id,
        status: 'pending',
        paymentMethod: 'cash-on-delivery',
        customerId: caller.uid,
        customerEmail: caller.email ?? null,
        shipping: { ...input.shipping },
        pricing: priced.pricing,
        paymob: null,
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    return {
      orderId: orderRef.id,
      status: 'pending',
      paymentMethod: 'cash-on-delivery',
      pricing: priced.pricing,
    };
  },
);

function nextDailyOrderCount(raw: unknown): number {
  const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  if (count >= MAX_ORDERS_PER_UID_PER_UTC_DAY) {
    throw new HttpsError(
      'resource-exhausted',
      'You have placed too many orders today. Try again tomorrow.',
    );
  }
  return count + 1;
}

function utcDayKey(now = new Date()): string {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
