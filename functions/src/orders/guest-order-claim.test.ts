import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { liveOffers } from '../../lib/offers/engine/index.js';
import {
  confirmedClaimEmail,
  isClaimableGuestOrder,
  MAX_GUEST_ORDERS_PER_CLAIM,
} from '../../lib/orders/guest-order-claim.js';
import { offerPricingSignedIn } from '../../lib/orders/offer-signed-in.js';

describe('claiming guest orders by email', () => {
  it('uses the token email only when it is confirmed, trimmed and lower-cased', () => {
    assert.equal(
      confirmedClaimEmail({ email: ' Shopper@Example.COM ', emailVerified: true }),
      'shopper@example.com',
    );
    assert.equal(confirmedClaimEmail({ email: 'shopper@example.com', emailVerified: false }), null);
    assert.equal(confirmedClaimEmail({ emailVerified: true }), null);
    assert.equal(confirmedClaimEmail({ email: '  ', emailVerified: true }), null);
  });

  it('links only guest orders with no owner and the same email', () => {
    const email = 'shopper@example.com';
    const guest = { termsVersion: '2026-11', termsAcceptedAt: 'x' };
    assert.equal(isClaimableGuestOrder({ customerId: null, customerEmail: email, guest }, email), true);
  });

  it('never moves an order that already belongs to an account, or one with another email', () => {
    const email = 'shopper@example.com';
    const guest = { termsVersion: '2026-11', termsAcceptedAt: 'x' };
    assert.equal(
      isClaimableGuestOrder({ customerId: 'other-uid', customerEmail: email, guest }, email),
      false,
    );
    assert.equal(
      isClaimableGuestOrder({ customerId: 'same-uid', customerEmail: email, guest }, email),
      false,
    );
    assert.equal(
      isClaimableGuestOrder({ customerId: null, customerEmail: 'someone@example.com', guest }, email),
      false,
    );
    assert.equal(isClaimableGuestOrder({ customerId: null, guest }, email), false);
    assert.equal(isClaimableGuestOrder(undefined, email), false);
  });

  it('never takes an order that was not placed as a guest', () => {
    const email = 'shopper@example.com';
    assert.equal(isClaimableGuestOrder({ customerId: null, customerEmail: email }, email), false);
    assert.equal(isClaimableGuestOrder({ customerEmail: email, guest: {} }, email), false);
  });

  it('links at most 50 orders per call', () => {
    assert.equal(MAX_GUEST_ORDERS_PER_CLAIM, 50);
  });
});

describe('signedIn flag for order pricing', () => {
  const base = {
    active: true,
    archived: false,
    schedule: { startsAt: null, endsAt: null },
    requiresCode: false,
    visibility: 'public',
    code: null,
    limits: { totalUses: null, perCustomer: null },
  };
  const offers = [
    { ...base, id: 'members', audience: 'signedIn' },
    { ...base, id: 'everyone', audience: 'everyone' },
  ] as unknown as Parameters<typeof liveOffers>[0];
  const now = new Date('2026-11-10T12:00:00Z');
  const live = (signedIn: boolean): string[] =>
    liveOffers(offers, { now, signedIn, codes: [] }).map((offer) => offer.id);

  it('a guest is priced without signed-in offers', () => {
    assert.equal(offerPricingSignedIn(null), false);
    assert.deepEqual(live(offerPricingSignedIn(null)), ['everyone']);
  });

  it('an account whose email is not confirmed is priced like a guest', () => {
    const caller = { email: 'shopper@example.com', emailVerified: false };
    assert.equal(offerPricingSignedIn(caller), false);
    assert.deepEqual(live(offerPricingSignedIn(caller)), ['everyone']);
  });

  it('an account with a confirmed email gets signed-in offers', () => {
    const caller = { email: 'shopper@example.com', emailVerified: true };
    assert.equal(offerPricingSignedIn(caller), true);
    assert.deepEqual(live(offerPricingSignedIn(caller)), ['members', 'everyone']);
  });
});
