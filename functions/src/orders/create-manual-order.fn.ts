import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireAcceptedTerms } from '../auth/require-accepted-terms.js';
import { requireRole } from '../auth/require-role.js';
import { parseCreateStoreOrderRequest } from './order-request.js';
import { priceStoreOrder, type OrderPricingSnapshot } from './order-pricing.server.js';
import { readOfferUses } from './offer-usage.js';
import { nextDailyOrderCount, utcDayKey } from './order-rate-limit.js';

/** Egypt-only orders paid outside Paymob and confirmed by staff (`confirmCodOrder`). */
export type ManualPaymentMethod = 'cash-on-delivery' | 'instapay';

export interface CreateManualOrderResponse<M extends ManualPaymentMethod = ManualPaymentMethod> {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: M;
  readonly pricing: OrderPricingSnapshot;
}

export type CreateCodOrderResponse = CreateManualOrderResponse<'cash-on-delivery'>;
export type CreateInstapayOrderResponse = CreateManualOrderResponse<'instapay'>;

const EGYPT_ONLY: Record<ManualPaymentMethod, string> = {
  'cash-on-delivery': 'Cash on Delivery is only available for orders delivered in Egypt.',
  instapay: 'InstaPay is only available for orders delivered in Egypt.',
};

/**
 * Egypt cash on delivery. The shopper pays the shipping fee first by InstaPay, then the rest in
 * cash on delivery. Admin `confirmCodOrder` (fee received) takes the items out of stock.
 */
export const createCodOrder = onCall(adminCallableOptions(), (request) =>
  createManualOrder(request, 'cash-on-delivery'),
);

/**
 * Egypt InstaPay. The shopper transfers the full total and sends the screenshot on WhatsApp;
 * admin `confirmCodOrder` (money seen in the bank app) takes the items out of stock.
 */
export const createInstapayOrder = onCall(adminCallableOptions(), (request) =>
  createManualOrder(request, 'instapay'),
);

/**
 * Creates a pending order. Stock is checked while pricing but not taken until staff confirm.
 */
async function createManualOrder<M extends ManualPaymentMethod>(
  request: CallableRequest,
  method: M,
): Promise<CreateManualOrderResponse<M>> {
  const caller = await requireRole(request, 'user');
  await requireAcceptedTerms(caller.uid);
  const input = parseCreateStoreOrderRequest({
    ...(isRecord(request.data) ? request.data : {}),
    paymentMethod: method,
  });
  if (input.shipping.country !== 'EG') {
    throw new HttpsError('failed-precondition', EGYPT_ONLY[method]);
  }

  const db = getFirestore();
  const priced = await priceStoreOrder(db, input, true);
  const orderRef = db.collection('orders').doc();

  await db.runTransaction(async (tx) => {
    const day = utcDayKey();
    const rateLimitRef = db.collection('orderRateLimits').doc(`${caller.uid}_${day}`);
    const rateLimitSnap = await tx.get(rateLimitRef);
    const nextRateCount = nextDailyOrderCount(rateLimitSnap.data()?.['count']);
    // Offer limits (free gifts, Buy X Get Y): an order counts once per offer, however many items it has.
    const addOfferUses = await readOfferUses(tx, db, caller.uid, priced.usedOffers);
    const now = FieldValue.serverTimestamp();
    addOfferUses();

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
      paymentMethod: method,
      customerId: caller.uid,
      customerEmail: caller.email ?? null,
      shipping: {
        ...input.shipping,
        boxId: priced.pricing.shipping?.boxId ?? null,
      },
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
    paymentMethod: method,
    pricing: priced.pricing,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
