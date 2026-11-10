import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import {
  canBeFreeItem,
  dealTag,
  displayPrice,
  freeItemProductIds,
  freeItemWins,
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
    basePrice: facts.price,
    offerPrice: facts.price,
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

describe('one discount per item: Buy X Get Y or the per-item offer, the bigger saving wins', () => {
  const TEE = product('tee-1000', ['apparel', 't-shirts'], 1000);
  const OTHER = product('tee-other', ['apparel', 't-shirts'], 1000);
  // A per-item offer is passed in as the piece's price after it (`offerPrice`).
  const withOffer = (facts, quantity, offerPrice) => line(facts, quantity, { offerPrice });

  it('example A: 10% off and Buy 2 get 1 free on three 1,000 items pays 2,000', () => {
    const result = priceBagDeals([withOffer(TEE, 3, 900)], [bxgy('b2g1', {})], CTX);
    const [only] = result.lines;
    assert.equal(only.total, 2000);
    assert.equal(only.before, 3000);
    assert.equal(only.discount, 1000);
    assert.equal(only.dealUnits, 3);
    assert.equal(only.offerUnits, 0);
    assert.equal(dealTag(only.deals, 3), '1 free');
    assert.deepEqual(result.offerIds, ['b2g1']);
  });

  it('example B: 50% off and Buy 2 get 1 free pays 1,500, with no deal and nothing counted', () => {
    const result = priceBagDeals([withOffer(TEE, 3, 500)], [bxgy('b2g1', {})], CTX);
    const [only] = result.lines;
    assert.equal(only.total, 1500);
    assert.equal(only.discount, 0);
    assert.equal(only.dealUnits, 0);
    assert.equal(only.offerUnits, 3);
    assert.deepEqual(only.deals, []);
    assert.equal(only.giftUnits, 3);
    assert.deepEqual(result.offerIds, []);
    assert.deepEqual(result.hints, []);
  });

  it('a tie keeps the per-item offer', () => {
    const b1g1 = bxgy('b1g1', { buy: { quantity: 1 } }, { title: 'Buy 1, get 1 free' });
    const result = priceBagDeals([withOffer(TEE, 2, 500)], [b1g1], CTX);
    assert.equal(result.lines[0].total, 1000);
    assert.deepEqual(result.offerIds, []);
  });

  it('pieces outside every group keep their per-item offer', () => {
    const result = priceBagDeals([withOffer(TEE, 4, 900)], [bxgy('b2g1', {})], CTX);
    const [only] = result.lines;
    // Three pieces in the group pay 1,000 with one free; the fourth keeps 10% off.
    assert.equal(only.dealUnits, 3);
    assert.equal(only.offerUnits, 1);
    assert.equal(only.before, 3900);
    assert.equal(only.total, 2900);
  });

  it('mixed bag: each group is compared on its own pieces', () => {
    const result = priceBagDeals(
      [withOffer(TEE, 3, 500), withOffer(OTHER, 3, 1000)],
      [bxgy('b2g1', {})],
      CTX,
    );
    // The pieces without an offer make the winning group; the half-price ones keep half price.
    assert.deepEqual(
      result.lines.map((entry) => entry.total),
      [1500, 2000],
    );
    assert.deepEqual(
      result.lines.map((entry) => entry.dealUnits),
      [0, 3],
    );
    assert.equal(result.discount, 1000);
    assert.deepEqual(result.offerIds, ['b2g1']);
  });

  it('a free grip loses to 10% off the racket, so the racket keeps its offer', () => {
    const result = priceBagDeals([withOffer(RACKET, 1, 5400), line(GRIP_1)], [RACKET_GRIP], CTX);
    assert.deepEqual(
      result.lines.map((entry) => entry.total),
      [5400, 150],
    );
    assert.deepEqual(result.offerIds, []);
  });

  it('a racket that pays full price in a group that won is priced before its offer', () => {
    // 10 off the racket (saves 10) loses to a free 150 grip: the racket pays 6,000.
    const result = priceBagDeals([withOffer(RACKET, 1, 5990), line(GRIP_1)], [RACKET_GRIP], CTX);
    assert.deepEqual(
      result.lines.map((entry) => [entry.dealUnits, entry.discount, entry.total]),
      [
        [1, 0, 6000],
        [1, 150, 0],
      ],
    );
  });

  it('a group one offer loses can still be used by another', () => {
    const tenPercent = bxgy(
      'b2g1-10',
      { get: { quantity: 1, percent: 10 } },
      { title: 'Buy 2, get 1 at 10% off', priority: 2 },
    );
    const free = bxgy('b2g1-free', {}, { priority: 1 });
    const result = priceBagDeals([withOffer(TEE, 3, 800)], [tenPercent, free], CTX);
    assert.equal(result.lines[0].total, 2000);
    assert.deepEqual(result.offerIds, ['b2g1-free']);
  });

  it('no "add more" nudge when the next group would lose to the per-item offer', () => {
    const halfPrice = priceBagDeals([withOffer(TEE, 1, 500)], [bxgy('b2g1', {})], CTX);
    assert.deepEqual(halfPrice.hints, []);
    const tenOff = priceBagDeals([withOffer(TEE, 1, 900)], [bxgy('b2g1', {})], CTX);
    assert.equal(tenOff.hints.length, 1);
    assert.equal(tenOff.hints[0].missing, 2);
  });
});

describe('free item promises (ATS-148)', () => {
  const RACKET_3000 = product('racket-3000', ['padel', 'rackets'], 3000);
  const GRIP_100 = product('grip-1', ['accessories', 'grips'], 100);
  const GRIP_400 = product('grip-2', ['accessories', 'grips'], 400);
  // 10% off the racket: one piece costs 2,700 and the offer saves 300.
  const racket = line(RACKET_3000, 1, { offerPrice: 2700 });
  const ANY_GRIP = bxgy(
    'racket-any-grip',
    {
      buy: { quantity: 1 },
      getConditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['grips'] }] }] },
    },
    {
      title: 'Buy a racket, get any grip free',
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] },
    },
  );

  it('racket + grip: a 100 grip is not really free next to 10% off a 3,000 racket', () => {
    assert.equal(freeItemWins([racket], [RACKET_GRIP], CTX, 'racket-grip', line(GRIP_100)), false);
    // A 400 grip saves more than the 300 the racket gives up, so it is really free.
    assert.equal(freeItemWins([racket], [RACKET_GRIP], CTX, 'racket-grip', line(GRIP_400)), true);
    // Without a per-item offer on the racket, any grip on the list is free.
    assert.equal(freeItemWins([line(RACKET_3000)], [RACKET_GRIP], CTX, 'racket-grip', line(GRIP_100)), true);
    // Another offer's id never counts.
    assert.equal(freeItemWins([racket], [RACKET_GRIP], CTX, 'other', line(GRIP_400)), false);
  });

  it('racket + grip in the bag: the racket keeps 10% off and the grip pays full price, with no promise', () => {
    const result = priceBagDeals([racket, line(GRIP_100)], [RACKET_GRIP], CTX);
    assert.deepEqual(
      result.lines.map((entry) => entry.total),
      [2700, 100],
    );
    assert.deepEqual(
      result.lines.map((entry) => entry.earns),
      [[], []],
    );
  });

  it('a racket that pays full price for a free grip says what it earns', () => {
    const result = priceBagDeals(
      [line(RACKET_3000, 1, { offerPrice: 2900 }), line(GRIP_400)],
      [RACKET_GRIP],
      CTX,
    );
    assert.deepEqual(
      result.lines.map((entry) => entry.total),
      [3000, 0],
    );
    assert.deepEqual(result.lines[0].earns, [
      { offerId: 'racket-grip', units: 1, percent: 100, freeLines: [1] },
    ]);
    assert.deepEqual(result.lines[1].earns, []);
  });

  it('free pieces from the same item earn nothing on another line', () => {
    const result = priceBagDeals([line(TEE_A, 3)], [bxgy('b2g1', {})], CTX);
    assert.equal(result.lines[0].discount, 500);
    assert.deepEqual(result.lines[0].earns, []);
  });

  it('no "add the free item" nudge for a category free item while the racket offer saves something', () => {
    const plain = priceBagDeals([line(RACKET_3000)], [ANY_GRIP], CTX);
    assert.equal(plain.hints.length, 1);
    assert.equal(plain.hints[0].kind, 'add-more');
    assert.equal(plain.hints[0].samePool, false);
    assert.deepEqual(priceBagDeals([racket], [ANY_GRIP], CTX).hints, []);
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
