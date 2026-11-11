import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled code (`npm test` builds first).
import { parseOfferDoc } from '../../lib/offers/offer-schema.js';
import { offerUseFits } from '../../lib/orders/offer-usage.js';
import { resolveLineGifts } from '../../lib/orders/order-gifts.js';
import { parseGiftPicks } from '../../lib/orders/order-request.js';

const CTX = { now: new Date('2026-11-08T12:00:00Z'), signedIn: true, codes: [] };
const BAG = {
  productId: 'bag-1',
  brandId: 'bullpadel',
  categoryIds: ['bags'],
  type: 'bag',
  modelGroup: null,
  colors: ['black'],
  sizes: [],
  tags: [],
  price: 3000,
};
const OFFER = parseOfferDoc('offer-bag', {
  name: 'Bag gifts',
  title: 'Free shirt and socks',
  active: true,
  conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['bags'] }] }] },
  reward: {
    kind: 'freeGift',
    gifts: [
      { id: 'shirt', name: 'Free shirt', productIds: ['tee-1'] },
      { id: 'socks', name: 'Free socks', productIds: ['socks-1'] },
    ],
  },
});

const TEE = {
  name: 'Tee',
  published: true,
  inStock: true,
  options: [
    {
      key: 'size',
      label: 'Size',
      values: [
        { id: 's', label: 'S' },
        { id: 'm', label: 'M' },
      ],
    },
  ],
  stockBySize: { s: 0, m: 3 },
  stock: 3,
};
const SOCKS = { name: 'Socks', published: true, inStock: true, stock: 5, options: [] };

function docs(overrides = {}) {
  return new Map(Object.entries({ 'tee-1': TEE, 'socks-1': SOCKS, ...overrides }));
}

function resolve(picks, opts = {}) {
  return resolveLineGifts({
    picks,
    quantity: opts.quantity ?? 1,
    product: opts.product ?? BAG,
    variant: null,
    offers: opts.offers ?? [OFFER],
    ctx: CTX,
    giftDocs: opts.giftDocs ?? docs(),
  });
}

const SHIRT_M = { offerId: 'offer-bag', giftId: 'shirt', productId: 'tee-1', sizeId: 'm' };
const SOCKS_PICK = { offerId: 'offer-bag', giftId: 'socks', productId: 'socks-1', sizeId: null };

function refused(fn, code) {
  assert.throws(fn, (error) => error.code === code);
}

describe('checkout gift checks', () => {
  it('accepts allowed gifts with their sizes', () => {
    const gifts = resolve([SHIRT_M, SOCKS_PICK], { quantity: 2 });
    assert.deepEqual(
      gifts.map((gift) => [gift.gift.id, gift.productId, gift.selection]),
      [
        ['shirt', 'tee-1', { size: 'm' }],
        ['socks', 'socks-1', {}],
      ],
    );
  });

  it('refuses a gift product the offer does not allow', () => {
    refused(() => resolve([{ ...SHIRT_M, productId: 'socks-1' }]), 'failed-precondition');
  });

  it('refuses gifts for a product that does not qualify', () => {
    refused(
      () => resolve([SHIRT_M], { product: { ...BAG, categoryIds: ['t-shirts'] } }),
      'failed-precondition',
    );
  });

  it('refuses gifts for an on-sale product when the offer skips sale items', () => {
    const skip = parseOfferDoc('offer-bag', {
      name: 'Bag gifts',
      title: 'Free shirt and socks',
      active: true,
      saleItems: 'exclude',
      conditions: OFFER.conditions,
      reward: OFFER.reward,
    });
    const onSale = { ...BAG, name: 'Bag', compareAtPrice: 3500 };
    refused(() => resolve([SOCKS_PICK], { product: onSale, offers: [skip] }), 'failed-precondition');
    // Not on sale: the same offer gives the gift.
    assert.equal(
      resolve([SOCKS_PICK], { product: { ...onSale, compareAtPrice: null }, offers: [skip] }).length,
      1,
    );
    // "Best discount wins" (the default) still gives gifts to the on-sale product.
    assert.equal(resolve([SOCKS_PICK], { product: onSale }).length, 1);
  });

  it('refuses a sold-out size, a missing size and too few pieces', () => {
    refused(() => resolve([{ ...SHIRT_M, sizeId: 's' }]), 'failed-precondition');
    refused(() => resolve([{ ...SHIRT_M, sizeId: null }]), 'invalid-argument');
    refused(() => resolve([SHIRT_M], { quantity: 4 }), 'failed-precondition');
  });

  it('refuses an unpublished gift product', () => {
    refused(
      () => resolve([SOCKS_PICK], { giftDocs: docs({ 'socks-1': { ...SOCKS, published: false } }) }),
      'failed-precondition',
    );
  });

  it('refuses picks from two offers on one line', () => {
    refused(() => parseGiftPicks([SHIRT_M, { ...SOCKS_PICK, offerId: 'other' }]), 'invalid-argument');
  });

  it('counts limits in orders', () => {
    assert.equal(offerUseFits({ totalUses: 2, perCustomer: null }, 1, 0), true);
    assert.equal(offerUseFits({ totalUses: 2, perCustomer: null }, 2, 0), false);
    assert.equal(offerUseFits({ totalUses: null, perCustomer: 1 }, 10, 1), false);
    assert.equal(offerUseFits({ totalUses: null, perCustomer: null }, 999, 999), true);
  });
});
