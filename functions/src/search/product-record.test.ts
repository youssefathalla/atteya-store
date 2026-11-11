import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled code (`npm test` builds first).
import { parseOfferDoc } from '../../lib/offers/offer-schema.js';
import { computeProductOfferFields, toSearchRecord } from '../../lib/search/product-record.js';

const NOW = new Date('2026-11-10T12:00:00Z');

const RACKET = {
  published: true,
  name: 'Head Speed Pro',
  slug: 'head-speed-pro',
  brandId: 'head',
  type: 'racket',
  categoryIds: ['padel', 'rackets'],
  categoryId: 'rackets',
  price: 1000,
  compareAtPrice: null,
};

const ON_RACKETS = { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] };

function offer(id: string, reward: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const parsed = parseOfferDoc(id, {
    name: id,
    title: id,
    active: true,
    scope: 'item',
    conditions: ON_RACKETS,
    reward,
    ...extra,
  });
  assert.ok(parsed, `offer ${id} parses`);
  return parsed;
}

function record(offers: unknown[], data: Record<string, unknown> = RACKET) {
  const result = toSearchRecord('racket-1', data, new Map(), new Map(), offers as never[], NOW);
  assert.ok(result, 'record is built');
  return result;
}

const PERCENT = offer('percent', { kind: 'percentOff', percent: 20 });
const AMOUNT = offer('amount', { kind: 'amountOff', amount: 150 });
const SET_PRICE = offer('set-price', { kind: 'fixedPrice', price: 800 });
const BUY_X = offer('buy-x', {
  kind: 'buyXGetY',
  buy: { quantity: 2 },
  get: { quantity: 1, percent: 100 },
  getConditions: null,
  cheapestFree: true,
  repeat: true,
  maxApplications: null,
});
const GIFT = offer('gift', {
  kind: 'freeGift',
  gifts: [{ id: 'gift-1', name: 'Free shirt', productIds: ['shirt-1'] }],
});
const FREE_SHIPPING = offer('free-shipping', { kind: 'freeShipping' });
const TIERED = offer('tiered', {
  kind: 'tiered',
  basis: 'quantity',
  tiers: [{ min: 1, percent: 10 }],
});

describe('search record onSale (Shop Sale filter)', () => {
  it('is false for a full-price product with no offers', () => {
    assert.equal(record([]).onSale, false);
  });

  it('is true for an old (compare-at) price, with its percent', () => {
    const result = record([], { ...RACKET, compareAtPrice: 1250 });
    assert.equal(result.onSale, true);
    assert.equal(result.discountPercent, 20);
  });

  for (const priceOffer of [PERCENT, AMOUNT, SET_PRICE]) {
    it(`is true when a live ${priceOffer.reward.kind} offer lowers the card price`, () => {
      const result = record([priceOffer]);
      assert.ok(result.displayPrice < 1000);
      assert.equal(result.onSale, true);
      // The old-price percent stays about the compare-at price only.
      assert.equal(result.discountPercent, 0);
    });
  }

  it('is false with only Buy X Get Y, Free gift, Free shipping or tiered offers', () => {
    assert.equal(record([BUY_X, GIFT, FREE_SHIPPING, TIERED]).onSale, false);
  });

  it('is false when the price offer is paused, archived or has ended', () => {
    assert.equal(
      record([offer('paused', { kind: 'percentOff', percent: 20 }, { active: false })]).onSale,
      false,
    );
    assert.equal(
      record([offer('archived', { kind: 'percentOff', percent: 20 }, { archived: true })]).onSale,
      false,
    );
    const ended = offer(
      'ended',
      { kind: 'percentOff', percent: 20 },
      { schedule: { startsAt: null, endsAt: new Date('2026-11-09T12:00:00Z') } },
    );
    assert.equal(record([ended]).onSale, false);
  });

  it('is false for a signed-in-only or code offer (cards are priced for visitors)', () => {
    const signedIn = offer('signed-in', { kind: 'percentOff', percent: 20 }, { audience: 'signedIn' });
    const code = offer('code', { kind: 'percentOff', percent: 20 }, { visibility: 'code' });
    assert.equal(record([signedIn, code]).onSale, false);
  });

  it('is false when the price offer does not match the product', () => {
    const other = offer(
      'bags',
      { kind: 'percentOff', percent: 20 },
      { conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['bags'] }] }] } },
    );
    assert.equal(record([other]).onSale, false);
  });

  it('is true with a price offer next to a tiered offer that alone would not count', () => {
    assert.equal(record([TIERED, AMOUNT]).onSale, true);
  });

  it('the offer refresh writes the same onSale as a full record', () => {
    for (const offers of [[], [PERCENT], [BUY_X, GIFT], [TIERED]]) {
      const fields = computeProductOfferFields('racket-1', RACKET, offers, NOW);
      assert.equal(fields.onSale, record(offers).onSale);
    }
    const compareAt = { ...RACKET, compareAtPrice: 1250 };
    assert.equal(computeProductOfferFields('racket-1', compareAt, [], NOW).onSale, true);
  });
});

describe('search record distinctKey (one card per model)', () => {
  it('groups colours of one model under the same key', () => {
    const black = toSearchRecord(
      'bag-black',
      { ...RACKET, modelGroup: 'multigame' },
      new Map(),
      new Map(),
      [],
      NOW,
    );
    const red = toSearchRecord(
      'bag-red',
      { ...RACKET, modelGroup: ' multigame ' },
      new Map(),
      new Map(),
      [],
      NOW,
    );
    assert.equal(black?.distinctKey, 'model:multigame');
    assert.equal(red?.distinctKey, black?.distinctKey);
  });

  it('gives a product without a model its own key', () => {
    assert.equal(record([]).distinctKey, 'product:racket-1');
    const blank = toSearchRecord('racket-2', { ...RACKET, modelGroup: '  ' }, new Map(), new Map(), [], NOW);
    assert.equal(blank?.distinctKey, 'product:racket-2');
  });

  it('never lets a model key collide with a product id', () => {
    const asModel = toSearchRecord('a', { ...RACKET, modelGroup: 'x' }, new Map(), new Map(), [], NOW);
    const asProduct = toSearchRecord('x', RACKET, new Map(), new Map(), [], NOW);
    assert.notEqual(asModel?.distinctKey, asProduct?.distinctKey);
  });
});
