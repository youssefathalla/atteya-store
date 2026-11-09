import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireAcceptedTerms } from '../auth/require-accepted-terms.js';
import { requireRole } from '../auth/require-role.js';
import {
  buildUnifiedCheckoutUrl,
  createPaymobIntention,
  splitPersonName,
  toPaymobCountry,
} from '../paymob/paymob-client.js';
import { paymobSecrets, requireConfiguredPaymob } from '../paymob/paymob-config.js';
import { isCardOrWalletLive } from '../store/store-info.js';
import { readOfferUses, releaseOfferUses, type UsedOffer } from './offer-usage.js';
import { parseCreateStoreOrderRequest } from './order-request.js';
import { priceStoreOrder, type OrderPricingSnapshot } from './order-pricing.server.js';
import { nextDailyOrderCount, utcDayKey } from './order-rate-limit.js';

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
    if (!isCardOrWalletLive()) {
      throw new HttpsError(
        'failed-precondition',
        'Card or Wallet is coming soon. Choose another way to pay, or message us on WhatsApp to order.',
      );
    }
    await requireAcceptedTerms(caller.uid);
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
    const priced = await priceStoreOrder(db, input, true, caller.uid);
    if (priced.pricing.totalEgp < 1) {
      throw new HttpsError('failed-precondition', 'Your order total is too low to pay online.');
    }

    const day = utcDayKey();
    const rateLimitRef = db.collection('orderRateLimits').doc(`${caller.uid}_${day}`);

    // Reserve the daily slot in a transaction BEFORE minting a Paymob Intention,
    // so concurrent callers cannot each create gateway sessions then lose the race.
    // Offer uses (free gifts, Buy X Get Y) are claimed in the same transaction and given back if Paymob fails.
    await reserveDailyOrderSlot(db, rateLimitRef, caller.uid, day, priced.usedOffers);

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
      try {
        await releaseDailyOrderSlot(db, rateLimitRef, caller.uid, day);
      } catch (releaseError: unknown) {
        console.error('Failed to release order rate-limit slot after Paymob error', releaseError);
      }
      try {
        await releaseOfferUses(db, caller.uid, priced.usedOffers);
      } catch (releaseError: unknown) {
        console.error('Failed to give back offer uses', releaseError);
      }
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

    try {
      await db.runTransaction(async (tx) => {
        const now = FieldValue.serverTimestamp();
        tx.set(orderRef, {
          id: orderId,
          status: 'pending',
          paymentMethod: 'paymob',
          customerId: caller.uid,
          customerEmail: caller.email ?? null,
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
        await releaseDailyOrderSlot(db, rateLimitRef, caller.uid, day);
      } catch (releaseError: unknown) {
        console.error('Failed to release order rate-limit slot after write error', releaseError);
      }
      try {
        await releaseOfferUses(db, caller.uid, priced.usedOffers);
      } catch (releaseError: unknown) {
        console.error('Failed to give back offer uses', releaseError);
      }
      throw new HttpsError(
        'unavailable',
        'We could not start online payment. Wait a moment and try again.',
      );
    }

    return {
      orderId,
      status: 'pending',
      paymentMethod: 'paymob',
      pricing: priced.pricing,
      checkoutUrl,
    };
  },
);

async function reserveDailyOrderSlot(
  db: Firestore,
  rateLimitRef: DocumentReference,
  uid: string,
  day: string,
  usedOffers: readonly UsedOffer[],
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateLimitRef);
    const nextRateCount = nextDailyOrderCount(snap.data()?.['count']);
    const addOfferUses = await readOfferUses(tx, db, uid, usedOffers);
    addOfferUses();
    tx.set(
      rateLimitRef,
      {
        uid,
        day,
        count: nextRateCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

/** Best-effort undo of a reserved slot when Intention/order write fails. */
async function releaseDailyOrderSlot(
  db: Firestore,
  rateLimitRef: DocumentReference,
  uid: string,
  day: string,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateLimitRef);
    const raw = snap.data()?.['count'];
    const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    const next = Math.max(0, count - 1);
    tx.set(
      rateLimitRef,
      {
        uid,
        day,
        count: next,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
