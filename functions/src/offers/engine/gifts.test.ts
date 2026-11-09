import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import { checkGiftPicks, giftOfferById, giftOfferForProduct } from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';

const NOW = new Date('2026-11-08T12:00:00Z');
const CTX = { now: NOW, signedIn: true, codes: [] };

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

function giftOffer(overrides = {}) {
  return parseOfferDoc('offer-bag', {
    name: 'Bag gifts',
    title: 'Free shirt and socks',
    active: true,
    conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['bags'] }] }] },
    reward: {
      kind: 'freeGift',
      gifts: [
        { id: 'shirt', name: 'Free shirt', productIds: ['tee-1', 'tee-2'] },
        { id: 'socks', name: 'Free socks', productIds: ['socks-1'] },
      ],
    },
    ...overrides,
  });
}

const ALL_IN_STOCK = [
  { productId: 'tee-1', published: true, inStock: true },
  { productId: 'tee-2', published: true, inStock: true },
  { productId: 'socks-1', published: true, inStock: true },
];

describe('free gift offers', () => {
  it('gives a qualifying product every gift with its choices', () => {
    const result = giftOfferForProduct(BAG, null, [giftOffer()], CTX, ALL_IN_STOCK);
    assert.ok(result);
    assert.equal(result.offerId, 'offer-bag');
    assert.deepEqual(
      result.gifts.map((gift) => [gift.id, gift.productIds]),
      [
        ['shirt', ['tee-1', 'tee-2']],
        ['socks', ['socks-1']],
      ],
    );
  });

  it('leaves out sold-out and unpublished choices', () => {
    const result = giftOfferForProduct(BAG, null, [giftOffer()], CTX, [
      { productId: 'tee-1', published: true, inStock: false },
      { productId: 'tee-2', published: true, inStock: true },
      { productId: 'socks-1', published: true, inStock: true },
    ]);
    assert.deepEqual(result?.gifts[0]?.productIds, ['tee-2']);
  });

  it('leaves out a gift with no choice in stock', () => {
    const result = giftOfferForProduct(BAG, null, [giftOffer()], CTX, [
      { productId: 'tee-1', published: true, inStock: true },
      { productId: 'socks-1', published: false, inStock: true },
    ]);
    assert.deepEqual(
      result?.gifts.map((gift) => gift.id),
      ['shirt'],
    );
  });

  it('gives nothing when every gift is sold out', () => {
    assert.equal(giftOfferForProduct(BAG, null, [giftOffer()], CTX, []), null);
  });

  it('gives nothing to a product outside the offer, or when the offer is off', () => {
    const tee = { ...BAG, productId: 'tee-1', categoryIds: ['t-shirts'] };
    assert.equal(giftOfferForProduct(tee, null, [giftOffer()], CTX, ALL_IN_STOCK), null);
    assert.equal(giftOfferForProduct(BAG, null, [giftOffer({ active: false })], CTX, ALL_IN_STOCK), null);
  });

  it('gives nothing from a cart-wide or minimum-spend gift offer saved before gifts worked', () => {
    const cartWide = giftOffer({ scope: 'cart', minimum: { subtotal: 3000 } });
    assert.equal(giftOfferForProduct(BAG, null, [cartWide], CTX, ALL_IN_STOCK), null);
    assert.equal(giftOfferById('offer-bag', BAG, null, [cartWide], CTX, ALL_IN_STOCK), null);
    const withMinimum = giftOffer({ minimum: { quantity: 2 } });
    assert.equal(giftOfferForProduct(BAG, null, [withMinimum], CTX, ALL_IN_STOCK), null);
  });

  it('reads an old one-product gift offer as one gift with one choice', () => {
    const old = parseOfferDoc('old', {
      name: 'Old gift',
      title: 'Free gift',
      active: true,
      conditions: { anyOf: [] },
      reward: { kind: 'freeGift', giftProductId: 'socks-1', giftVariantId: null, quantity: 1 },
    });
    assert.deepEqual(old?.reward, {
      kind: 'freeGift',
      gifts: [{ id: 'gift-1', name: 'Free gift', productIds: ['socks-1'] }],
    });
  });

  it('accepts picks of allowed choices, in gift order', () => {
    const offer = giftOfferById('offer-bag', BAG, null, [giftOffer()], CTX, ALL_IN_STOCK);
    assert.ok(offer);
    const check = checkGiftPicks(offer, [
      { giftId: 'socks', productId: 'socks-1' },
      { giftId: 'shirt', productId: 'tee-2' },
    ]);
    assert.equal(check.ok, true);
    assert.deepEqual(check.ok ? check.picks.map((pick) => [pick.gift.id, pick.productId]) : [], [
      ['shirt', 'tee-2'],
      ['socks', 'socks-1'],
    ]);
  });

  it('refuses a product the gift does not offer, an unknown gift and a repeated gift', () => {
    const offer = giftOfferById('offer-bag', BAG, null, [giftOffer()], CTX, ALL_IN_STOCK);
    assert.ok(offer);
    assert.deepEqual(checkGiftPicks(offer, [{ giftId: 'shirt', productId: 'socks-1' }]), {
      ok: false,
      problem: 'choice-not-allowed',
    });
    assert.deepEqual(checkGiftPicks(offer, [{ giftId: 'hat', productId: 'tee-1' }]), {
      ok: false,
      problem: 'unknown-gift',
    });
    assert.deepEqual(
      checkGiftPicks(offer, [
        { giftId: 'shirt', productId: 'tee-1' },
        { giftId: 'shirt', productId: 'tee-2' },
      ]),
      { ok: false, problem: 'duplicate-gift' },
    );
  });
});
