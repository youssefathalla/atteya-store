import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import {
  bestBundle,
  bundleCover,
  bundleOneRowPrice,
  dealTag,
  displayPrice,
  priceBagDeals,
  splitBundleTotal,
  validateOffer,
} from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';

const CTX = { now: new Date('2026-11-11T12:00:00Z'), signedIn: true, codes: [] };

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

const SOCKS_A = product('socks-a', ['apparel', 'socks'], 175);
const SOCKS_B = product('socks-b', ['apparel', 'socks'], 175);
const SOCKS_C = product('socks-c', ['apparel', 'socks'], 175);
const TEE = product('tee', ['apparel', 't-shirts'], 500);

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

const SOCKS_ONLY = { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['socks'] }] }] };

function bundle(id, rows, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: overrides.title ?? 'Socks bundle',
    active: true,
    scope: 'item',
    conditions: SOCKS_ONLY,
    reward: { kind: 'bundlePrice', rows },
    ...overrides,
  });
}

function offer(id, reward, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: id,
    active: true,
    scope: 'item',
    conditions: SOCKS_ONLY,
    reward,
    ...overrides,
  });
}

const WITH_ONE = bundle('socks-123', [
  { quantity: 1, price: 125 },
  { quantity: 2, price: 200 },
  { quantity: 3, price: 275 },
]);
const NO_ONE = bundle('socks-23', [
  { quantity: 2, price: 200 },
  { quantity: 3, price: 275 },
]);

function bagTotal(deals) {
  return deals.lines.reduce((sum, entry) => sum + entry.total, 0);
}

describe('Bundle price: rows and split helpers', () => {
  it('finds the cheapest mix of rows, rows repeat', () => {
    const rows = [
      { quantity: 1, price: 125 },
      { quantity: 2, price: 200 },
      { quantity: 3, price: 275 },
    ];
    assert.equal(bundleCover(rows, 4).total, 400);
    assert.equal(bundleCover(rows, 6).total, 550);
    assert.deepEqual(
      bundleCover(rows, 6).rows.map((row) => [row.quantity, row.count]),
      [[3, 2]],
    );
    assert.equal(bundleCover(rows, 7).total, 675);
    assert.equal(bundleCover([{ quantity: 2, price: 200 }], 3), null);
  });

  it('leaves a piece no row can cover at its own price', () => {
    const rows = [{ quantity: 2, price: 200 }];
    const best = bestBundle(rows, [175, 175, 175]);
    assert.equal(best.pieces, 2);
    assert.equal(best.cover.total, 200);
  });

  it('splits a total into whole pounds that add up, extra pounds first', () => {
    assert.deepEqual(splitBundleTotal(275, [175, 175, 175]), [92, 92, 91]);
    assert.deepEqual(splitBundleTotal(200, [175, 175]), [100, 100]);
    const mixed = splitBundleTotal(275, [300, 175, 175]);
    assert.equal(
      mixed.reduce((sum, share) => sum + share, 0),
      275,
    );
    assert.ok(mixed[0] > mixed[1]);
  });

  it('reads the 1-piece row', () => {
    assert.equal(bundleOneRowPrice(WITH_ONE), 125);
    assert.equal(bundleOneRowPrice(NO_ONE), null);
  });
});

describe('Bundle price in the bag', () => {
  const cases = [
    // [pieces, total with a 1-row, total without]
    [1, 125, 175],
    [2, 200, 200],
    [3, 275, 275],
    [4, 400, 400],
    [7, 675, 675],
  ];
  for (const [pieces, withOne, withoutOne] of cases) {
    it(`${pieces} piece(s): ${withOne} with a 1-row, ${withoutOne} without`, () => {
      assert.equal(bagTotal(priceBagDeals([line(SOCKS_A, pieces)], [WITH_ONE], CTX)), withOne);
      assert.equal(bagTotal(priceBagDeals([line(SOCKS_A, pieces)], [NO_ONE], CTX)), withoutOne);
    });
  }

  it('6 pieces are two 3-rows', () => {
    const deals = priceBagDeals([line(SOCKS_A, 6)], [WITH_ONE], CTX);
    assert.equal(bagTotal(deals), 550);
    assert.deepEqual(
      deals.bundles[0].rows.map((row) => [row.quantity, row.count]),
      [[3, 2]],
    );
  });

  it('3 for 275 shows each share and the saving', () => {
    const deals = priceBagDeals([line(SOCKS_A, 1), line(SOCKS_B, 1), line(SOCKS_C, 1)], [WITH_ONE], CTX);
    assert.deepEqual(
      deals.lines.map((entry) => entry.total),
      [92, 92, 91],
    );
    assert.deepEqual(
      deals.lines.map((entry) => entry.before),
      [175, 175, 175],
    );
    const [summary] = deals.bundles;
    assert.equal(summary.units, 3);
    assert.equal(summary.total, 275);
    assert.equal(summary.saving, 250);
    assert.equal(summary.lineIndex, 2);
    assert.equal(summary.next, null);
    assert.deepEqual(deals.offerIds, ['socks-123']);
    assert.equal(deals.lines[0].deals[0].bundle, true);
    assert.equal(dealTag(deals.lines[0].deals, 1), 'Bundle price');
  });

  it('mixes products and leaves other items alone', () => {
    const deals = priceBagDeals([line(SOCKS_A, 1), line(TEE, 1), line(SOCKS_B, 1)], [WITH_ONE], CTX);
    assert.deepEqual(
      deals.lines.map((entry) => entry.total),
      [100, 500, 100],
    );
    assert.equal(deals.bundles[0].lineIndex, 2);
    assert.equal(deals.lines[1].dealUnits, 0);
  });

  it('nudges to the next bigger row until the top row', () => {
    const one = priceBagDeals([line(SOCKS_A, 1)], [WITH_ONE], CTX).bundles[0];
    assert.deepEqual(one.next, { missing: 1, quantity: 2, price: 200 });
    assert.equal(one.units, 1);
    const two = priceBagDeals([line(SOCKS_A, 2)], [WITH_ONE], CTX).bundles[0];
    assert.deepEqual(two.next, { missing: 1, quantity: 3, price: 275 });
    assert.equal(priceBagDeals([line(SOCKS_A, 3)], [WITH_ONE], CTX).bundles[0].next, null);
    assert.equal(priceBagDeals([line(SOCKS_A, 4)], [WITH_ONE], CTX).bundles[0].next, null);
  });

  it('one piece without a 1-row pays full price, with a nudge and no bundle', () => {
    const deals = priceBagDeals([line(SOCKS_A, 1)], [NO_ONE], CTX);
    assert.equal(deals.lines[0].total, 175);
    assert.equal(deals.lines[0].dealUnits, 0);
    assert.deepEqual(deals.offerIds, []);
    assert.equal(deals.bundles[0].units, 0);
    assert.deepEqual(deals.bundles[0].next, { missing: 1, quantity: 2, price: 200 });
  });

  it('pieces in a bundle keep their free gifts', () => {
    const deals = priceBagDeals([line(SOCKS_A, 2, { giftWorth: 100 })], [WITH_ONE], CTX);
    assert.equal(deals.lines[0].total, 200);
    assert.equal(deals.lines[0].giftUnits, 2);
  });

  it('a per-item offer that saves more wins (one discount per item)', () => {
    // 50% off: 88 a piece, so 2 pieces cost 176 < 200.
    const half = offer('half', { kind: 'percentOff', percent: 50 });
    const deals = priceBagDeals([line(SOCKS_A, 2, { offerPrice: 88 })], [half, NO_ONE], CTX);
    assert.equal(bagTotal(deals), 176);
    assert.equal(deals.lines[0].offerUnits, 2);
    assert.deepEqual(deals.offerIds, []);
  });

  it('the bundle wins over a smaller per-item offer and takes its place', () => {
    const tenOff = offer('ten', { kind: 'percentOff', percent: 10 });
    const deals = priceBagDeals([line(SOCKS_A, 2, { offerPrice: 158 })], [tenOff, NO_ONE], CTX);
    assert.equal(bagTotal(deals), 200);
    assert.equal(deals.lines[0].offerUnits, 0);
    assert.equal(deals.lines[0].dealUnits, 2);
  });

  it('a 3-piece bag gets the bundle, not Buy 2 get 1 free, when the bundle saves more', () => {
    const b2g1 = offer(
      'b2g1',
      {
        kind: 'buyXGetY',
        buy: { quantity: 2 },
        get: { quantity: 1, percent: 100 },
        getConditions: null,
        repeat: true,
      },
      { priority: 10 },
    );
    const deals = priceBagDeals([line(SOCKS_A, 3)], [b2g1, WITH_ONE], CTX);
    assert.equal(bagTotal(deals), 275);
    assert.deepEqual(deals.offerIds, ['socks-123']);
  });

  it('Buy 1 get 1 free wins when it saves more, never both', () => {
    const b1g1 = offer('b1g1', {
      kind: 'buyXGetY',
      buy: { quantity: 1 },
      get: { quantity: 1, percent: 100 },
      getConditions: null,
      repeat: true,
    });
    const deals = priceBagDeals([line(SOCKS_A, 4)], [WITH_ONE, b1g1], CTX);
    assert.equal(bagTotal(deals), 350);
    assert.deepEqual(deals.offerIds, ['b1g1']);
    assert.equal(deals.bundles.length, 0);
  });

  it('skips sale items when the offer leaves them out', () => {
    const exclude = bundle('ex', [{ quantity: 2, price: 200 }], { saleItems: 'exclude' });
    const deals = priceBagDeals([line(SOCKS_A, 2, { onSale: true })], [exclude], CTX);
    assert.equal(bagTotal(deals), 350);
  });
});

describe('Bundle price on cards and in the offer form', () => {
  it('the card "From" price uses the 1-piece row', () => {
    const priced = { ...SOCKS_A, name: 'Socks', compareAtPrice: null };
    const result = displayPrice(priced, [WITH_ONE], CTX);
    assert.equal(result.fromPrice, 125);
    assert.equal(result.partial, true);
    assert.deepEqual(result.offerIds, ['socks-123']);
    assert.equal(displayPrice(priced, [NO_ONE], CTX).fromPrice, 175);
  });

  const draft = (rows) => ({
    ...WITH_ONE,
    id: undefined,
    reward: { kind: 'bundlePrice', rows },
  });

  it('refuses no rows, repeated pieces, pieces above 20 and a zero total', () => {
    const codes = (rows) => validateOffer(draft(rows), [], [], CTX).errors.map((issue) => issue.code);
    assert.ok(codes([]).includes('reward.bundleRows'));
    assert.ok(
      codes([
        { quantity: 2, price: 200 },
        { quantity: 2, price: 190 },
      ]).includes('reward.bundleDuplicate'),
    );
    assert.ok(codes([{ quantity: 21, price: 200 }]).includes('reward.bundlePieces'));
    assert.ok(codes([{ quantity: 2, price: 0 }]).includes('reward.bundlePrice'));
    assert.deepEqual(codes([{ quantity: 2, price: 200 }]), []);
  });

  it('warns about a price offer on the same products', () => {
    const sale = offer('sale', { kind: 'percentOff', percent: 10 });
    const socks = [{ ...SOCKS_A, name: 'Socks', compareAtPrice: null }];
    const warnings = validateOffer(draft([{ quantity: 2, price: 200 }]), socks, [sale], CTX).warnings;
    const overlap = warnings.find((issue) => issue.code === 'overlap.sale');
    assert.match(overlap.message, /whichever saves them more, never both/);
  });

  it('reads rows from a saved offer, dropping bad ones', () => {
    const parsed = bundle('p', [
      { quantity: 3, price: 275 },
      { quantity: 1, price: 125 },
      { quantity: 0, price: 10 },
      { quantity: 3, price: 250 },
    ]);
    assert.deepEqual(parsed.reward.rows, [
      { quantity: 1, price: 125 },
      { quantity: 3, price: 275 },
    ]);
  });
});
