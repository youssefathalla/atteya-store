import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import {
  canBeFreeItem,
  dealTag,
  displayPrice,
  freeItemProductIds,
  priceBagDeals,
} from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';

const CTX = { now: new Date('2026-11-09T12:00:00Z'), signedIn: true, codes: [] };

function product(id, categoryIds, price, extra = {}) {
  return {
    productId: id,
    brandId: 'brand',
    categoryIds,
    type: '',
    modelGroup: null,
    colors: [],
    sizes: [],
    tags: [],
    price,
    ...extra,
  };
}

const TEE_A = product('tee-a', ['apparel', 't-shirts'], 500);
const TEE_B = product('tee-b', ['apparel', 't-shirts'], 300);
const TEE_C = product('tee-c', ['apparel', 't-shirts'], 400);
const RACKET = product('racket-1', ['padel', 'rackets'], 6000);
const GRIP_1 = product('grip-1', ['accessories', 'grips'], 150);
const GRIP_2 = product('grip-2', ['accessories', 'grips'], 120);
const BALLS = product('balls-1', ['padel', 'balls'], 250);

function line(facts, quantity = 1, extra = {}) {
  return {
    product: facts,
    variant: null,
    quantity,
    unitPrice: facts.price,
    onSale: false,
    giftWorth: 0,
    ...extra,
  };
}

function bxgy(id, reward, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: overrides.title ?? 'Buy 2, get 1 free',
    active: true,
    scope: 'item',
    conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
    reward: {
      kind: 'buyXGetY',
      buy: { quantity: 2 },
      get: { quantity: 1, percent: 100 },
      getConditions: null,
      cheapestFree: true,
      repeat: true,
      maxApplications: null,
      ...reward,
    },
    ...overrides,
  });
}

const RACKET_GRIP = bxgy(
  'racket-grip',
  {
    buy: { quantity: 1 },
    getConditions: { anyOf: [{ allOf: [{ field: 'productId', in: ['grip-1', 'grip-2', 'grip-3'] }] }] },
  },
  {
    title: 'Buy a racket, get a free grip',
    conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] },
  },
);

describe('buy x get y in the bag', () => {
  it('buy 2 get 1 free: the cheapest of three is free', () => {
    const result = priceBagDeals([line(TEE_A), line(TEE_B), line(TEE_C)], [bxgy('b2g1', {})], CTX);
    assert.equal(result.discount, 300);
    assert.deepEqual(
      result.lines.map((entry) => entry.discount),
      [0, 300, 0],
    );
    assert.deepEqual(result.lines[1].deals, [{ offerId: 'b2g1', units: 1, percent: 100, discount: 300 }]);
    assert.deepEqual(result.offerIds, ['b2g1']);
    assert.deepEqual(result.hints, []);
  });

  it('buy 2 get 1 at 50% off', () => {
    const result = priceBagDeals(
      [line(TEE_A, 2), line(TEE_B)],
      [bxgy('half', { get: { quantity: 1, percent: 50 } })],
      CTX,
    );
    assert.equal(result.discount, 150);
    assert.equal(result.lines[1].deals[0].percent, 50);
  });

  it('repeats for every extra group when repeat is on', () => {
    const result = priceBagDeals([line(TEE_A, 4), line(TEE_B, 2)], [bxgy('b2g1', {})], CTX);
    // Six pieces = two groups: both cheap tees are free.
    assert.equal(result.discount, 600);
    assert.equal(result.lines[1].discountedUnits, 2);
  });

  it('gives one group only when repeat is off', () => {
    const result = priceBagDeals([line(TEE_A, 4), line(TEE_B, 2)], [bxgy('once', { repeat: false })], CTX);
    assert.equal(result.discount, 300);
    assert.deepEqual(result.hints, []);
  });

  it('stops at max applications', () => {
    const result = priceBagDeals([line(TEE_B, 9)], [bxgy('max2', { maxApplications: 2 })], CTX);
    assert.equal(result.discount, 600);
    assert.equal(result.lines[0].discountedUnits, 2);
    assert.equal(result.lines[0].giftUnits, 7);
  });

  it('free item from a product list: buy a racket, get the cheaper grip free', () => {
    const result = priceBagDeals([line(RACKET), line(GRIP_1), line(GRIP_2)], [RACKET_GRIP], CTX);
    assert.deepEqual(
      result.lines.map((entry) => entry.discount),
      [0, 0, 120],
    );
    assert.deepEqual(result.hints, []);
  });

  it('asks the shopper to choose the free item when none is in the bag', () => {
    const result = priceBagDeals([line(RACKET)], [RACKET_GRIP], CTX);
    assert.equal(result.discount, 0);
    assert.deepEqual(result.hints, [
      {
        kind: 'choose-free',
        offerId: 'racket-grip',
        title: 'Buy a racket, get a free grip',
        lineIndex: 0,
        missing: 1,
        free: 1,
        percent: 100,
        samePool: false,
        productIds: ['grip-1', 'grip-2', 'grip-3'],
      },
    ]);
  });

  it('not enough items: no discount, and a nudge that counts every missing piece', () => {
    const one = priceBagDeals([line(TEE_A)], [bxgy('b2g1', {})], CTX);
    assert.equal(one.discount, 0);
    assert.equal(one.hints.length, 1);
    assert.equal(one.hints[0].kind, 'add-more');
    assert.equal(one.hints[0].missing, 2);
    assert.equal(one.hints[0].lineIndex, 0);
    assert.equal(one.hints[0].samePool, true);

    const two = priceBagDeals([line(TEE_A), line(TEE_B)], [bxgy('b2g1', {})], CTX);
    assert.equal(two.discount, 0);
    assert.equal(two.hints.length, 1);
    assert.equal(two.hints[0].kind, 'add-more');
    assert.equal(two.hints[0].missing, 1);
    assert.equal(two.hints[0].lineIndex, 1);
    assert.equal(two.hints[0].samePool, true);
  });

  it('after a full group with repeat on, the leftover piece gets a nudge for the next group', () => {
    const four = priceBagDeals([line(TEE_A, 4)], [bxgy('b2g1', {})], CTX);
    assert.equal(four.discount, 500);
    assert.equal(four.hints.length, 1);
    assert.equal(four.hints[0].missing, 2);
  });

  it('free item from another product: no nudge until the bought part is complete', () => {
    const buy2 = bxgy(
      'two-rackets-grip',
      {
        buy: { quantity: 2 },
        getConditions: { anyOf: [{ allOf: [{ field: 'productId', in: ['grip-1'] }] }] },
      },
      { conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] } },
    );
    assert.deepEqual(priceBagDeals([line(RACKET)], [buy2], CTX).hints, []);
    assert.equal(priceBagDeals([line(RACKET, 2)], [buy2], CTX).hints[0].kind, 'choose-free');
  });

  it('mixed bag: only qualifying items count, two offers never share a piece', () => {
    const result = priceBagDeals(
      [line(RACKET), line(BALLS), line(TEE_A, 2), line(GRIP_2), line(TEE_B)],
      [bxgy('b2g1', {}), RACKET_GRIP],
      CTX,
    );
    assert.deepEqual(
      result.lines.map((entry) => entry.discount),
      [0, 0, 0, 120, 300],
    );
    assert.equal(result.discount, 420);
    assert.deepEqual([...result.offerIds].sort(), ['b2g1', 'racket-grip']);
  });

  it('keeps the free gift when it is worth more than the discount, and the other way round', () => {
    // Gift worth 400 beats a free 300 tee: the bag-with-gift piece is never the free one.
    const giftWins = priceBagDeals(
      [line(TEE_A), line(TEE_C), line(TEE_B, 1, { giftWorth: 400 })],
      [bxgy('b2g1', {})],
      CTX,
    );
    assert.deepEqual(
      giftWins.lines.map((entry) => entry.discount),
      [0, 400, 0],
    );
    assert.equal(giftWins.lines[2].giftUnits, 1);

    // A gift worth 100 loses to a free 300 tee: that piece is free and gets no gift.
    const dealWins = priceBagDeals(
      [line(TEE_A), line(TEE_C), line(TEE_B, 1, { giftWorth: 100 })],
      [bxgy('b2g1', {})],
      CTX,
    );
    assert.deepEqual(
      dealWins.lines.map((entry) => entry.discount),
      [0, 0, 300],
    );
    assert.equal(dealWins.lines[2].giftUnits, 0);
  });

  it('leaves sale items out when the offer excludes them, and ignores ended offers', () => {
    const excluded = priceBagDeals(
      [line(TEE_A), line(TEE_C), line(TEE_B, 1, { onSale: true })],
      [bxgy('b2g1', {}, { saleItems: 'exclude' })],
      CTX,
    );
    assert.equal(excluded.discount, 0);

    const ended = priceBagDeals(
      [line(TEE_A), line(TEE_B), line(TEE_C)],
      [bxgy('old', {}, { schedule: { startsAt: null, endsAt: new Date('2026-11-01T00:00:00Z') } })],
      CTX,
    );
    assert.equal(ended.discount, 0);
  });

  it('reads a free-item product list', () => {
    assert.deepEqual(freeItemProductIds(RACKET_GRIP.reward.getConditions), ['grip-1', 'grip-2', 'grip-3']);
    assert.equal(freeItemProductIds(null), null);
    assert.equal(freeItemProductIds({ anyOf: [{ allOf: [{ field: 'categoryIds', in: ['grips'] }] }] }), null);
  });

  it('tags a discounted line', () => {
    assert.equal(dealTag([{ units: 1, percent: 100 }], 1), 'Free');
    assert.equal(dealTag([{ units: 1, percent: 100 }], 3), '1 free');
    assert.equal(dealTag([{ units: 2, percent: 50 }], 2), '\u221250%');
    assert.equal(dealTag([{ units: 1, percent: 50 }], 2), '1 at \u221250%');
  });
});

describe('free choices the bag may offer', () => {
  it('offers only products the free-item rule would really discount', () => {
    assert.equal(canBeFreeItem(RACKET_GRIP, GRIP_1, false), true);
    assert.equal(canBeFreeItem(RACKET_GRIP, BALLS, false), false);
  });

  it('leaves out a sale item when the offer excludes sale items, and an excluded product', () => {
    const noSale = bxgy(
      'racket-grip-no-sale',
      {
        buy: { quantity: 1 },
        getConditions: { anyOf: [{ allOf: [{ field: 'productId', in: ['grip-1', 'grip-2'] }] }] },
      },
      {
        conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] },
        saleItems: 'exclude',
        exclude: { anyOf: [{ allOf: [{ field: 'productId', in: ['grip-2'] }] }] },
      },
    );
    assert.equal(canBeFreeItem(noSale, GRIP_1, false), true);
    assert.equal(canBeFreeItem(noSale, GRIP_1, true), false);
    assert.equal(canBeFreeItem(noSale, GRIP_2, false), false);
    // Same rule as pricing: a sale grip in the bag gets no discount.
    const priced = priceBagDeals([line(RACKET), line(GRIP_1, 1, { onSale: true })], [noSale], CTX);
    assert.equal(priced.lines[1].discount, 0);
  });
});

describe('offer ids on a product (search index, Shop the Offer)', () => {
  const NOW = { now: new Date('2026-11-09T12:00:00Z'), signedIn: false };
  const tee = { ...TEE_A, name: 'Tee', compareAtPrice: null };

  it('lists every offer the product is in, even when its badge does not fit on the card', () => {
    // Four label offers with the same badge text: only one badge shows, all four are listed.
    const offers = ['b2g1', 'b2g1-again', 'b2g1-third', 'b2g1-fourth'].map((id) => bxgy(id, {}));
    const result = displayPrice(tee, offers, NOW);
    assert.equal(result.badges.length, 1);
    assert.deepEqual([...result.offerIds].sort(), ['b2g1', 'b2g1-again', 'b2g1-fourth', 'b2g1-third']);
  });

  it('leaves out offers the product is not in, and sale items an offer excludes', () => {
    const offers = [bxgy('b2g1', {}), RACKET_GRIP, bxgy('no-sale', {}, { saleItems: 'exclude' })];
    assert.deepEqual([...displayPrice(tee, offers, NOW).offerIds].sort(), ['b2g1', 'no-sale']);
    const onSale = { ...tee, compareAtPrice: 700 };
    assert.deepEqual(displayPrice(onSale, offers, NOW).offerIds, ['b2g1']);
  });
});
