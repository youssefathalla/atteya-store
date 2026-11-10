import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { guestOfferCustomerKey } from '../../lib/orders/offer-usage.js';
import { parseGuestCheckout } from '../../lib/orders/order-request.js';
import {
  guestEmailRateLimitId,
  guestIpRateLimitId,
  guestRateLimitExpireAt,
  guestStoreRateLimitId,
  hashGuestEmail,
  hashGuestOrderIp,
  MAX_GUEST_ORDERS_PER_EMAIL_PER_UTC_DAY,
  MAX_GUEST_ORDERS_PER_IP_PER_UTC_DAY,
  MAX_GUEST_ORDERS_PER_UTC_DAY,
  nextDailyOrderCount,
  nextGuestEmailOrderCount,
  nextGuestIpOrderCount,
  nextGuestStoreOrderCount,
} from '../../lib/orders/order-rate-limit.js';
import { isOrderViewKey, newOrderViewKey, orderViewFields } from '../../lib/orders/order-view.js';

const GUEST_LIMIT =
  /Too many orders were placed today\. Please try again tomorrow or message us on WhatsApp\./;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('guest payload', () => {
  it('reads a valid email, trimmed and lower-cased', () => {
    assert.deepEqual(parseGuestCheckout({ email: '  Shopper@Example.COM ' }), {
      email: 'shopper@example.com',
    });
  });

  it('refuses a missing, empty or invalid email', () => {
    assert.equal(parseGuestCheckout(undefined), null);
    assert.equal(parseGuestCheckout(null), null);
    assert.equal(parseGuestCheckout({}), null);
    assert.equal(parseGuestCheckout({ email: '' }), null);
    assert.equal(parseGuestCheckout({ email: 'not-an-email' }), null);
    assert.equal(parseGuestCheckout({ email: 42 }), null);
    assert.equal(parseGuestCheckout({ email: `${'a'.repeat(250)}@example.com` }), null);
  });
});

describe('guest rate limits', () => {
  it('per connection: 5 a day', () => {
    assert.equal(MAX_GUEST_ORDERS_PER_IP_PER_UTC_DAY, 5);
    assert.equal(nextGuestIpOrderCount(undefined), 1);
    assert.equal(nextGuestIpOrderCount(4), 5);
    assert.throws(() => nextGuestIpOrderCount(5), GUEST_LIMIT);
  });

  it('per email: 5 a day', () => {
    assert.equal(MAX_GUEST_ORDERS_PER_EMAIL_PER_UTC_DAY, 5);
    assert.equal(nextGuestEmailOrderCount(0), 1);
    assert.equal(nextGuestEmailOrderCount(4), 5);
    assert.throws(() => nextGuestEmailOrderCount(5), GUEST_LIMIT);
  });

  it('whole store: 200 a day', () => {
    assert.equal(MAX_GUEST_ORDERS_PER_UTC_DAY, 200);
    assert.equal(nextGuestStoreOrderCount('junk'), 1);
    assert.equal(nextGuestStoreOrderCount(199), 200);
    assert.throws(() => nextGuestStoreOrderCount(200), GUEST_LIMIT);
  });

  it('signed-in limit is unchanged (20 a day)', () => {
    assert.equal(nextDailyOrderCount(19), 20);
    assert.throws(() => nextDailyOrderCount(20), /too many orders today/);
  });

  it('doc ids never hold the IP or the email', () => {
    const ipHash = hashGuestOrderIp('203.0.113.7');
    assert.match(ipHash, /^[0-9a-f]{32}$/);
    assert.equal(guestIpRateLimitId(ipHash, '20261110'), `guest_ip_${ipHash}_20261110`);
    assert.ok(!guestIpRateLimitId(ipHash, '20261110').includes('203.0.113.7'));
    const emailHash = hashGuestEmail('shopper@example.com');
    assert.equal(emailHash, sha256('shopper@example.com'));
    assert.equal(guestEmailRateLimitId(emailHash, '20261110'), `guest_email_${emailHash}_20261110`);
    assert.equal(guestStoreRateLimitId('20261110'), 'guest_all_20261110');
  });

  it('expires 2 days later', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    assert.equal(guestRateLimitExpireAt(now).toISOString(), '2026-11-12T12:00:00.000Z');
  });
});

describe('guest offer-limit key', () => {
  it('is guest_ plus the sha256 of the lower-cased email', () => {
    assert.equal(guestOfferCustomerKey('shopper@example.com'), `guest_${sha256('shopper@example.com')}`);
    assert.equal(
      guestOfferCustomerKey(' Shopper@Example.com '),
      guestOfferCustomerKey('shopper@example.com'),
    );
    assert.notEqual(guestOfferCustomerKey('a@example.com'), guestOfferCustomerKey('b@example.com'));
  });
});

describe('order view', () => {
  it('view keys are 32 random bytes in base64url', () => {
    const key = newOrderViewKey();
    assert.equal(Buffer.from(key, 'base64url').length, 32);
    assert.ok(isOrderViewKey(key));
    assert.notEqual(newOrderViewKey(), key);
    assert.equal(isOrderViewKey('short'), false);
  });

  it('copies only what the order page reads', () => {
    const view = orderViewFields('o1', {
      status: 'pending',
      paymentMethod: 'instapay',
      customerId: null,
      customerEmail: 'shopper@example.com',
      viewKey: 'secret',
      confirmedBy: 'staff-uid',
      cancelledBy: 'staff-uid',
      deliveryFeeSetBy: 'staff-uid',
      stockIssues: [{ productId: 'p1' }],
      paymob: { intentionId: 'int_1', amountCents: 1000, currency: 'EGP', paidAt: null },
      pricing: { totalEgp: 10 },
      shipping: { city: 'Cairo' },
      needsReview: true,
    });
    assert.equal(view['id'], 'o1');
    assert.equal(view['status'], 'pending');
    assert.deepEqual(view['pricing'], { totalEgp: 10 });
    assert.equal(view['needsReview'], true);
    assert.deepEqual(view['paymob'], { amountCents: 1000, currency: 'EGP', paidAt: null });
    for (const hidden of [
      'customerId',
      'customerEmail',
      'viewKey',
      'confirmedBy',
      'cancelledBy',
      'deliveryFeeSetBy',
      'stockIssues',
    ]) {
      assert.ok(!(hidden in view), hidden);
    }
  });
});
