import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { identifyOrderCustomer, orderCustomerFields, requireCustomerTerms } from './order-customer.js';
import { parseCreateStoreOrderRequest } from './order-request.js';
import { priceStoreOrder, type OrderPricingSnapshot } from './order-pricing.server.js';
import { readOfferUses } from './offer-usage.js';
import { utcDayKey } from './order-rate-limit.js';
import { logGuestStoreCapReached, readOrderRateLimits } from './order-rate-limit-docs.js';
import { newOrderViewKey } from './order-view.js';

/** Egypt-only orders paid outside Paymob and confirmed by staff (`confirmCodOrder`). */
export type ManualPaymentMethod = 'cash-on-delivery' | 'instapay';

export interface CreateManualOrderResponse<M extends ManualPaymentMethod = ManualPaymentMethod> {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: M;
  readonly pricing: OrderPricingSnapshot;
  /** A guest order's secret view key (for `?key=` on the order page); null when signed in. */
  readonly viewKey: string | null;
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
  const customer = await identifyOrderCustomer(request);
  await requireCustomerTerms(customer);
  const input = parseCreateStoreOrderRequest({
    ...(isRecord(request.data) ? request.data : {}),
    paymentMethod: method,
  });
  if (input.shipping.country !== 'EG') {
    throw new HttpsError('failed-precondition', EGYPT_ONLY[method]);
  }

  const db = getFirestore();
  const priced = await priceStoreOrder(db, input, customer.signedIn, customer.offerKey);
  const orderRef = db.collection('orders').doc();
  const viewKey = customer.kind === 'guest' ? newOrderViewKey() : null;
  const day = utcDayKey();

  // Set inside the transaction (which may retry) and logged once after it commits.
  let filledGuestStoreCap = false;
  await db.runTransaction(async (tx) => {
    const rateLimits = await readOrderRateLimits(tx, db, customer, day);
    filledGuestStoreCap = rateLimits.filledGuestStoreCap;
    // Offer limits (every offer type with a limit): an order counts once per offer, however many items it has.
    const addOfferUses = await readOfferUses(tx, db, customer.offerKey, priced.usedOffers);
    const now = FieldValue.serverTimestamp();
    addOfferUses();
    rateLimits.write();

    tx.set(orderRef, {
      id: orderRef.id,
      status: 'pending',
      paymentMethod: method,
      ...orderCustomerFields(customer, viewKey, now),
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
  if (filledGuestStoreCap) logGuestStoreCapReached(day);

  return {
    orderId: orderRef.id,
    status: 'pending',
    paymentMethod: method,
    pricing: priced.pricing,
    viewKey,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
