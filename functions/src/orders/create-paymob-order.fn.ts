import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import {
  buildUnifiedCheckoutUrl,
  createPaymobIntention,
  splitPersonName,
  toPaymobCountry,
} from '../paymob/paymob-client.js';
import { paymobSecrets, requireConfiguredPaymob } from '../paymob/paymob-config.js';
import { parseCreateStoreOrderRequest } from './order-request.js';
import { priceStoreOrder, type OrderPricingSnapshot } from './order-pricing.server.js';

const MAX_ORDERS_PER_UID_PER_UTC_DAY = 20;

export interface CreatePaymobOrderResponse {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: 'paymob';
  readonly pricing: OrderPricingSnapshot;
  readonly checkoutUrl: string;
}

export const createPaymobOrder = onCall(
  adminCallableOptions({ secrets: [...paymobSecrets()] }),
  async (request): Promise<CreatePaymobOrderResponse> => {
    const caller = await requireRole(request, 'user');
    const input = parseCreateStoreOrderRequest({
      ...(isRecord(request.data) ? request.data : {}),
      paymentMethod: 'paymob',
    });

    let paymobCfg;
    try {
      paymobCfg = requireConfiguredPaymob();
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Online payment is not ready yet. Try again later or choose another option when available.',
      );
    }

    const db = getFirestore();
    const priced = await priceStoreOrder(db, input, true);
    if (priced.pricing.totalEgp < 1) {
      throw new HttpsError('failed-precondition', 'Your order total is too low to pay online.');
    }

    // Enforce the daily cap before minting a Paymob Intention (gateway quota).
    // The write transaction re-checks under contention.
    const day = utcDayKey();
    const rateLimitRef = db.collection('orderRateLimits').doc(`${caller.uid}_${day}`);
    const preLimitSnap = await rateLimitRef.get();
    assertUnderDailyOrderCap(preLimitSnap.data()?.['count']);

    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;
    const amountCents = priced.pricing.totalEgp * 100;
    const name = splitPersonName(input.shipping.fullName);
    const email =
      caller.email && caller.email.includes('@') ? caller.email : 'orders@atteyastore.com';

    let intention;
    try {
      intention = await createPaymobIntention({
        baseUrl: paymobCfg.baseUrl,
        secretKey: paymobCfg.secretKey,
        amountCents,
        currency: 'EGP',
        integrationIds: paymobCfg.integrationIds,
        billingData: {
          first_name: name.first,
          last_name: name.last,
          phone_number: input.shipping.phone,
          email,
          street: input.shipping.line1,
          building: 'NA',
          floor: 'NA',
          apartment: input.shipping.line2 ?? 'NA',
          city: input.shipping.city,
          country: toPaymobCountry(input.shipping.country),
          state: input.shipping.region ?? input.shipping.city,
        },
        items: [
          {
            name: 'Atteya Store order',
            amount: amountCents,
            description: `Order ${orderId}`,
            quantity: 1,
          },
        ],
        specialReference: orderId,
        notificationUrl: paymobCfg.notificationUrl,
        redirectionUrl: `${paymobCfg.storefrontUrl}/checkout/confirmation/${orderId}`,
      });
    } catch (error: unknown) {
      console.error('Paymob Intention error', error);
      throw new HttpsError(
        'unavailable',
        'We could not start online payment. Wait a moment and try again.',
      );
    }

    const checkoutUrl = buildUnifiedCheckoutUrl(
      paymobCfg.baseUrl,
      paymobCfg.publicKey,
      intention.clientSecret,
    );

    await db.runTransaction(async (tx) => {
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
        id: orderId,
        status: 'pending',
        paymentMethod: 'paymob',
        customerId: caller.uid,
        customerEmail: caller.email ?? null,
        shipping: {
          ...input.shipping,
        },
        pricing: priced.pricing,
        paymob: {
          intentionId: intention.id,
          intentionOrderId: intention.intentionOrderId,
          amountCents,
          currency: 'EGP',
          transactionId: null,
          paidAt: null,
        },
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    return {
      orderId,
      status: 'pending',
      paymentMethod: 'paymob',
      pricing: priced.pricing,
      checkoutUrl,
    };
  },
);

function assertUnderDailyOrderCap(raw: unknown): void {
  const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  if (count >= MAX_ORDERS_PER_UID_PER_UTC_DAY) {
    throw new HttpsError(
      'resource-exhausted',
      'You have placed too many orders today. Try again tomorrow.',
    );
  }
}

function nextDailyOrderCount(raw: unknown): number {
  assertUnderDailyOrderCap(raw);
  const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
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
