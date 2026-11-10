import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import { validateOffer } from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const CTX = { now: NOW, signedIn: true, codes: [] };

function product(id, categoryIds, price) {
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
    name: id,
    compareAtPrice: null,
  };
}

const BAG_1 = product('bag-1', ['bags'], 3000);
const BAG_2 = product('bag-2', ['bags'], 2500);
const TEE = product('tee-1', ['apparel', 't-shirts'], 500);
const PRODUCTS = [BAG_1, BAG_2, TEE];

const BAGS = { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['bags'] }] }] };
const EVERYTHING = { anyOf: [] };

const REWARDS = {
  percentOff: { kind: 'percentOff', percent: 20 },
  amountOff: { kind: 'amountOff', amount: 100 },
  fixedPrice: { kind: 'fixedPrice', price: 1000 },
  buyXGetY: {
    kind: 'buyXGetY',
    buy: { quantity: 2 },
    get: { quantity: 1, percent: 100 },
    getConditions: null,
    cheapestFree: true,
    repeat: true,
    maxApplications: null,
  },
  freeGift: {
    kind: 'freeGift',
    gifts: [{ id: 'gift-1', name: 'Free shirt', productIds: ['tee-1'] }],
  },
  freeShipping: { kind: 'freeShipping' },
};

function offer(id, kind, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: id,
    active: true,
    scope: 'item',
    conditions: BAGS,
    reward: REWARDS[kind],
    ...overrides,
  });
}

/** The Heads-up overlap lines for a draft checked against the given other offers. */
function overlapLines(draft, others) {
  return validateOffer(draft, PRODUCTS, others, CTX)
    .warnings.filter((warning) => warning.code.startsWith('overlap.'))
    .map((warning) => warning.message);
}

describe('validateOffer overlap warnings', () => {
  it('two price offers: whichever is cheaper', () => {
    for (const mine of ['percentOff', 'amountOff', 'fixedPrice']) {
      for (const theirs of ['percentOff', 'amountOff', 'fixedPrice']) {
        assert.deepEqual(overlapLines(offer('draft', mine), [offer('Bags sale', theirs)]), [
          '2 products are also in "Bags sale". Shoppers get whichever is cheaper.',
        ]);
      }
    }
  });

  it('a price offer and Buy X get Y: whichever saves more, never both, both ways', () => {
    const expected = ['2 products are also in "other". Shoppers get whichever saves them more, never both.'];
    assert.deepEqual(overlapLines(offer('draft', 'percentOff'), [offer('other', 'buyXGetY')]), expected);
    assert.deepEqual(overlapLines(offer('draft', 'buyXGetY'), [offer('other', 'fixedPrice')]), expected);
  });

  it('a free gift and a price offer: shoppers get both, both ways', () => {
    const giftOnEverything = offer('draft', 'freeGift', { conditions: EVERYTHING });
    assert.deepEqual(overlapLines(giftOnEverything, [offer('20% off bags', 'percentOff')]), [
      '2 products also have "20% off bags". Shoppers get both: the discount and the free gift.',
    ]);
    assert.deepEqual(overlapLines(offer('draft', 'amountOff'), [offer('Bag gifts', 'freeGift')]), [
      '2 products also have "Bag gifts". Shoppers get both: the discount and the free gift.',
    ]);
  });

  it('a free gift and Buy X get Y: each item gets whichever is worth more, both ways', () => {
    const expected = [
      '2 products also have "other". Each item gets either the free gift or the Buy X get Y discount, whichever is worth more.',
    ];
    assert.deepEqual(overlapLines(offer('draft', 'freeGift'), [offer('other', 'buyXGetY')]), expected);
    assert.deepEqual(overlapLines(offer('draft', 'buyXGetY'), [offer('other', 'freeGift')]), expected);
  });

  it('two free gift offers: only the higher-priority one applies', () => {
    assert.deepEqual(overlapLines(offer('draft', 'freeGift'), [offer('Bag gifts', 'freeGift')]), [
      '2 products are also in "Bag gifts". Only the higher-priority gift offer applies.',
    ]);
  });

  it('two Buy X get Y offers: each item counts toward one of them', () => {
    assert.deepEqual(overlapLines(offer('draft', 'buyXGetY'), [offer('other', 'buyXGetY')]), [
      '2 products are also in "other". Each item counts toward one Buy X get Y offer only, the higher-priority one first.',
    ]);
  });

  it('free shipping with anything: no warning', () => {
    for (const kind of Object.keys(REWARDS)) {
      assert.deepEqual(overlapLines(offer('draft', 'freeShipping'), [offer('other', kind)]), []);
      assert.deepEqual(overlapLines(offer('draft', kind), [offer('other', 'freeShipping')]), []);
    }
  });

  it('uses the singular for one product', () => {
    const teeSale = offer('Tee sale', 'percentOff', {
      conditions: { anyOf: [{ allOf: [{ field: 'productId', in: ['tee-1'] }] }] },
    });
    const giftOnEverything = offer('draft', 'freeGift', { conditions: EVERYTHING });
    assert.deepEqual(overlapLines(offer('draft', 'amountOff', { conditions: EVERYTHING }), [teeSale]), [
      '1 product is also in "Tee sale". Shoppers get whichever is cheaper.',
    ]);
    assert.deepEqual(overlapLines(giftOnEverything, [teeSale]), [
      '1 product also has "Tee sale". Shoppers get both: the discount and the free gift.',
    ]);
  });

  it('a scheduled offer ends its line with the Cairo start date', () => {
    // 23:30 UTC on Nov 14 is already Nov 15 in Cairo.
    const later = offer('Weekend sale', 'percentOff', {
      schedule: { startsAt: new Date('2026-11-14T23:30:00Z'), endsAt: null },
    });
    assert.deepEqual(overlapLines(offer('draft', 'percentOff'), [later]), [
      '2 products are also in "Weekend sale". Shoppers get whichever is cheaper. (starts 15 Nov 2026)',
    ]);
  });

  it('warns about code-only and signed-in offers too', () => {
    const coded = offer('Coupon', 'percentOff', { requiresCode: true, code: 'BAGS', visibility: 'code' });
    const members = offer('Members', 'percentOff', { audience: 'signedIn' });
    assert.equal(overlapLines(offer('draft', 'amountOff'), [coded, members]).length, 2);
  });

  it('skips paused, archived and ended offers, products that do not overlap, and the offer itself', () => {
    const paused = offer('Paused', 'percentOff', { active: false });
    const archived = offer('Archived', 'percentOff', { archived: true });
    const ended = offer('Ended', 'percentOff', {
      schedule: { startsAt: null, endsAt: new Date('2026-11-09T12:00:00Z') },
    });
    const tees = offer('Tees', 'percentOff', {
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
    });
    const self = offer('draft', 'percentOff');
    assert.deepEqual(overlapLines(self, [paused, archived, ended, tees, self]), []);
  });

  it('warnings never block saving', () => {
    const result = validateOffer(offer('draft', 'freeGift'), PRODUCTS, [offer('other', 'percentOff')], CTX);
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.some((warning) => warning.code === 'overlap.other'));
  });
});
