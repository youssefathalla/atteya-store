import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import {
  buildUnifiedCheckoutUrl,
  createPaymobIntention,
  splitPersonName,
  toPaymobCountry,
} from '../paymob/paymob-client.js';
import { paymobSecrets, requireConfiguredPaymob } from '../paymob/paymob-config.js';
import { isCardOrWalletLive } from '../store/store-info.js';
import { orderConfirmationUrl } from '../email/order-email-model.js';
import { readOfferUses, releaseOfferUses, type UsedOffer } from './offer-usage.js';
import {
  identifyOrderCustomer,
  orderCustomerFields,
  requireCustomerTerms,
  type OrderCustomer,
} from './order-customer.js';
import { parseCreateStoreOrderRequest } from './order-request.js';
import { priceStoreOrder, type OrderPricingSnapshot } from './order-pricing.server.js';
import { utcDayKey } from './order-rate-limit.js';
import {
  logGuestStoreCapReached,
  readOrderRateLimits,
  releaseOrderRateLimits,
} from './order-rate-limit-docs.js';
import { newOrderViewKey } from './order-view.js';

export interface CreatePaymobOrderResponse {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: 'paymob';
  readonly pricing: OrderPricingSnapshot;
  readonly checkoutUrl: string;
  /** A guest order's secret view key (for `?key=` on the order page); null when signed in. */
  readonly viewKey: string | null;
}

export const createPaymobOrder = onCall(
  adminCallableOptions({ secrets: [...paymobSecrets()] }),
  async (request): Promise<CreatePaymobOrderResponse> => {
    const customer = await identifyOrderCustomer(request);
    if (!isCardOrWalletLive()) {
      throw new HttpsError(
        'failed-precondition',
        'Card is coming soon. Choose another way to pay, or message us on WhatsApp to order.',
      );
    }
    await requireCustomerTerms(customer);
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
    const priced = await priceStoreOrder(db, input, customer.signedIn, customer.offerKeys);
    if (priced.pricing.totalEgp < 1) {
      throw new HttpsError('failed-precondition', 'Your order total is too low to pay online.');
    }

    const day = utcDayKey();

    // Reserve the daily slot in a transaction BEFORE minting a Paymob Intention,
    // so concurrent callers cannot each create gateway sessions then lose the race.
    // Offer uses (free gifts, Buy X Get Y) are claimed in the same transaction and given back if
    // Paymob fails, with any offer this order switched off at its last use switched back on.
    const { endedOfferIds, filledGuestStoreCap } = await reserveDailyOrderSlot(
      db,
      customer,
      day,
      priced.usedOffers,
    );

    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;
    const amountCents = priced.pricing.totalEgp * 100;
    const name = splitPersonName(input.shipping.fullName);
    const viewKey = customer.kind === 'guest' ? newOrderViewKey() : null;
    const email = customer.email && customer.email.includes('@') ? customer.email : 'orders@atteyastore.com';

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
        redirectionUrl: orderConfirmationUrl(paymobCfg.storefrontUrl, orderId, viewKey),
      });
    } catch (error: unknown) {
      console.error('Paymob Intention error', error);
      try {
        await releaseOrderRateLimits(db, customer, day);
      } catch (releaseError: unknown) {
        console.error('Failed to release order rate-limit slot after Paymob error', releaseError);
      }
      try {
        await releaseOfferUses(db, customer.offerKeys, priced.usedOffers, endedOfferIds);
      } catch (releaseError: unknown) {
        console.error('Failed to give back offer uses', releaseError);
      }
      throw new HttpsError('unavailable', 'We could not start online payment. Wait a moment and try again.');
    }

    const checkoutUrl = buildUnifiedCheckoutUrl(
      paymobCfg.baseUrl,
      paymobCfg.publicKey,
      intention.clientSecret,
    );

    try {
      await db.runTransaction(async (tx) => {
        const now = FieldValue.serverTimestamp();
        tx.set(orderRef, {
          id: orderId,
          status: 'pending',
          paymentMethod: 'paymob',
          ...orderCustomerFields(customer, viewKey, now),
          shipping: {
            ...input.shipping,
            boxId: priced.pricing.shipping?.boxId ?? null,
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
    } catch (error: unknown) {
      console.error('Paymob order write error after Intention', error);
      try {
        await releaseOrderRateLimits(db, customer, day);
      } catch (releaseError: unknown) {
        console.error('Failed to release order rate-limit slot after write error', releaseError);
      }
      try {
        await releaseOfferUses(db, customer.offerKeys, priced.usedOffers, endedOfferIds);
      } catch (releaseError: unknown) {
        console.error('Failed to give back offer uses', releaseError);
      }
      throw new HttpsError('unavailable', 'We could not start online payment. Wait a moment and try again.');
    }

    // Logged only once the order is saved: a failed start gives its slot back.
    if (filledGuestStoreCap) logGuestStoreCapReached(day);
    return {
      orderId,
      status: 'pending',
      paymentMethod: 'paymob',
      pricing: priced.pricing,
      checkoutUrl,
      viewKey,
    };
  },
);

async function reserveDailyOrderSlot(
  db: Firestore,
  customer: OrderCustomer,
  day: string,
  usedOffers: readonly UsedOffer[],
): Promise<{ readonly endedOfferIds: readonly string[]; readonly filledGuestStoreCap: boolean }> {
  return db.runTransaction(async (tx) => {
    const rateLimits = await readOrderRateLimits(tx, db, customer, day);
    const addOfferUses = await readOfferUses(tx, db, customer.offerKeys, usedOffers);
    const endedOfferIds = addOfferUses();
    rateLimits.write();
    return { endedOfferIds, filledGuestStoreCap: rateLimits.filledGuestStoreCap };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
