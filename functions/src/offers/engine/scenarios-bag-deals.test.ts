import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Whole-bag scenario tests (plan rows J, L, I7, I8, O9-O12 and the rule 8 racket examples).
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import {
  canBeFreeItem,
  checkGiftPicks,
  dealTag,
  displayPrice,
  freeItemProductIds,
  freeItemWins,
  giftChoiceIds,
  giftOfferById,
  giftOfferForProduct,
  priceBagDeals,
  priceItem,
  shippingQuote,
  unitDiscount,
  validateOffer,
} from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const CTX = { now: NOW, signedIn: true, codes: [] };
const VISITOR = { now: NOW, signedIn: false, codes: [] };

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

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
    name: id,
    compareAtPrice: null,
    ...extra,
  };
}

const TEES = ['apparel', 't-shirts'];
const P1 = product('p1', TEES, 1000);
// P2 is on sale: 800, was 1,000.
const P2 = product('p2', TEES, 800, { compareAtPrice: 1000 });
const P3 = product('p3', TEES, 200);
const RACKET_3000 = product('racket-3000', ['padel', 'rackets'], 3000);
const RACKET_5000 = product('racket-5000', ['padel', 'rackets'], 5000);
const GRIP_100 = product('grip-100', ['accessories', 'grips'], 100);
const GRIP_150 = product('grip-150', ['accessories', 'grips'], 150);
const GRIP_120 = product('grip-120', ['accessories', 'grips'], 120);
const GRIP_300 = product('grip-300', ['accessories', 'grips'], 300);
const GRIP_400 = product('grip-400', ['accessories', 'grips'], 400);
const GRIP_500 = product('grip-500', ['accessories', 'grips'], 500);
const GRIP_600 = product('grip-600', ['accessories', 'grips'], 600);
const BAG_3000 = product('bag-3000', ['bags'], 3000);
const BAG_400 = product('bag-400', ['bags'], 400);

/** A bag line with explicit prices (what the bag passes after pricing the item). */
function line(facts, quantity = 1, extra = {}) {
  return {
    product: facts,
    variant: null,
    quantity,
    basePrice: facts.price,
    offerPrice: facts.price,
    onSale: facts.compareAtPrice !== null && facts.compareAtPrice > facts.price,
    giftWorth: 0,
    ...extra,
  };
}

/** A bag line priced the way the bag does it: per-item offers first (`priceItem`), then the deal. */
function bagLine(facts, quantity, itemOffers = [], extra = {}) {
  const variant = extra.variant ?? null;
  const priced = priceItem(facts, variant, itemOffers, CTX);
  return {
    product: facts,
    variant,
    quantity,
    basePrice: priced.basePrice,
    offerPrice: priced.effectivePrice,
    onSale: priced.listPrice > priced.basePrice,
    giftWorth: extra.giftWorth ?? 0,
  };
}

const TEE_CONDITIONS = { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] };
const EVERYTHING = { anyOf: [] };
const RACKETS = { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] };
const ids = (field, list) => ({ anyOf: [{ allOf: [{ field, in: list }] }] });

/** Buy X Get Y offer; defaults to "Buy 2, get 1 free" on t-shirts, repeat on, no cap. */
function bxgy(id, reward = {}, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: overrides.title ?? 'Buy 2, get 1 free',
    active: true,
    scope: 'item',
    conditions: TEE_CONDITIONS,
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

/** A per-item price offer (Percent off, Amount off, Set price) on t-shirts. */
function itemOffer(id, reward, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: id,
    active: true,
    scope: 'item',
    conditions: TEE_CONDITIONS,
    reward,
    ...overrides,
  });
}

function giftOffer(id, gifts, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: overrides.title ?? 'Free shirt and socks',
    active: true,
    conditions: ids('categoryIds', ['bags']),
    reward: { kind: 'freeGift', gifts },
    ...overrides,
  });
}

const SHIRT_GIFT = { id: 'shirt', name: 'Free shirt', productIds: ['tee-1', 'tee-2'] };
const SOCKS_GIFT = { id: 'socks', name: 'Free socks', productIds: ['socks-1'] };
const ALL_IN_STOCK = [
  { productId: 'tee-1', published: true, inStock: true },
  { productId: 'tee-2', published: true, inStock: true },
  { productId: 'socks-1', published: true, inStock: true },
];

const totals = (result) => result.lines.map((entry) => entry.total);
const discounts = (result) => result.lines.map((entry) => entry.discount);

// ---------------------------------------------------------------------------------------------
// J. Buy X get Y: groups, repeat, cap, cheapest free
// ---------------------------------------------------------------------------------------------

describe('J1-J12: Buy X get Y groups', () => {
  const B2G1 = bxgy('b2g1');

  it('J1: Buy 2 get 1 free on three 1,000 pieces: line 2,000, 3,000 struck, tag "1 free"', () => {
    const result = priceBagDeals([line(P1, 3)], [B2G1], CTX);
    const [only] = result.lines;
    assert.equal(only.before, 3000);
    assert.equal(only.discount, 1000);
    assert.equal(only.total, 2000);
    assert.equal(only.discountedUnits, 1);
    assert.equal(only.giftUnits, 2);
    assert.equal(dealTag(only.deals, 3), '1 free');
    assert.deepEqual(result.offerIds, ['b2g1']);
    assert.equal(result.discount, 1000);
    assert.deepEqual(result.hints, []);
  });

  it('J2: two pieces earn nothing, and the bag says "1 more" is missing', () => {
    const result = priceBagDeals([line(P1, 2)], [B2G1], CTX);
    assert.equal(result.discount, 0);
    assert.deepEqual(totals(result), [2000]);
    assert.deepEqual(result.hints, [
      {
        kind: 'add-more',
        offerId: 'b2g1',
        title: 'Buy 2, get 1 free',
        lineIndex: 0,
        missing: 1,
        free: 1,
        percent: 100,
        samePool: true,
        productIds: [],
      },
    ]);
  });

  it('J3: pressing "Add 1" (quantity 2 to 3) makes one piece free and the nudge goes away', () => {
    const before = priceBagDeals([line(P1, 2)], [B2G1], CTX);
    const after = priceBagDeals([line(P1, before.hints[0].missing + 2)], [B2G1], CTX);
    assert.deepEqual(totals(after), [2000]);
    assert.deepEqual(after.hints, []);
  });

  it('J4: one piece earns nothing; the nudge counts both missing pieces', () => {
    // The plan (J4) predates ATS-148: asking for 2 more is truthful, since 3 pieces do give 1 free.
    const result = priceBagDeals([line(P1, 1)], [B2G1], CTX);
    assert.equal(result.discount, 0);
    assert.equal(result.hints.length, 1);
    assert.equal(result.hints[0].missing, 2);
    assert.equal(result.hints[0].kind, 'add-more');
  });

  it('J5: repeat on, six pieces: 2 free (two groups of 3)', () => {
    const result = priceBagDeals([line(P1, 6)], [B2G1], CTX);
    assert.equal(result.discount, 2000);
    assert.deepEqual(totals(result), [4000]);
    assert.equal(result.lines[0].discountedUnits, 2);
    assert.equal(dealTag(result.lines[0].deals, 6), '2 free');
  });

  it('J6: repeat off, six pieces: only 1 free and no nudge for a second group', () => {
    const result = priceBagDeals([line(P1, 6)], [bxgy('once', { repeat: false })], CTX);
    assert.equal(result.discount, 1000);
    assert.deepEqual(totals(result), [5000]);
    assert.deepEqual(result.hints, []);
  });

  it('J7: repeat on, max 2 groups, nine pieces: only 2 free', () => {
    const result = priceBagDeals([line(P1, 9)], [bxgy('max2', { maxApplications: 2 })], CTX);
    assert.equal(result.discount, 2000);
    assert.equal(result.lines[0].discountedUnits, 2);
    assert.equal(result.lines[0].giftUnits, 7);
    assert.deepEqual(result.hints, []);
  });

  it('J7b: a cap of 1 with repeat on gives one group, same as repeat off', () => {
    const result = priceBagDeals([line(P1, 9)], [bxgy('max1', { maxApplications: 1 })], CTX);
    assert.equal(result.discount, 1000);
  });

  it('J8: the cheapest of the group is the free one (P3 at 200 beats P1 at 1,000)', () => {
    const result = priceBagDeals([line(P1, 2), line(P3, 1)], [B2G1], CTX);
    assert.deepEqual(discounts(result), [0, 200]);
    assert.deepEqual(totals(result), [2000, 0]);
    assert.equal(dealTag(result.lines[1].deals, 1), 'Free');
    assert.equal(dealTag(result.lines[0].deals, 2), '');
  });

  it('J9: P1 x4 + P3 x2 with repeat on: the two P3 are free (two groups)', () => {
    const result = priceBagDeals([line(P1, 4), line(P3, 2)], [B2G1], CTX);
    assert.deepEqual(discounts(result), [0, 400]);
    assert.deepEqual(totals(result), [4000, 0]);
    assert.equal(result.discount, 400);
    assert.equal(dealTag(result.lines[1].deals, 2), 'Free');
  });

  it('J10: 50% instead of free: "1 at -50%" and the line is 2,500', () => {
    const result = priceBagDeals([line(P1, 3)], [bxgy('half', { get: { quantity: 1, percent: 50 } })], CTX);
    assert.deepEqual(totals(result), [2500]);
    assert.equal(dealTag(result.lines[0].deals, 3), '1 at −50%');
    assert.deepEqual(result.lines[0].deals, [{ offerId: 'half', units: 1, percent: 50, discount: 500 }]);
  });

  it('J10b: 50% off on every piece is tagged "-50%"', () => {
    const b1g1half = bxgy('half', { buy: { quantity: 1 }, get: { quantity: 1, percent: 50 } });
    const result = priceBagDeals([line(P1, 1), line(P3, 1)], [b1g1half], CTX);
    // P3 is the discounted one: 100 off.
    assert.deepEqual(discounts(result), [0, 100]);
    assert.equal(dealTag(result.lines[1].deals, 1), '−50%');
  });

  it('J11: Buy 1 get 1: two pieces, one free', () => {
    const result = priceBagDeals([line(P1, 2)], [bxgy('b1g1', { buy: { quantity: 1 } })], CTX);
    assert.deepEqual(totals(result), [1000]);
    assert.equal(result.discount, 1000);
  });

  it('J12: Buy 3 get 2: five pieces, two free; with four the nudge says add 1 more to get 2 free', () => {
    const b3g2 = bxgy('b3g2', { buy: { quantity: 3 }, get: { quantity: 2, percent: 100 } });
    const five = priceBagDeals([line(P1, 5)], [b3g2], CTX);
    assert.equal(five.discount, 2000);
    assert.equal(five.lines[0].discountedUnits, 2);
    assert.equal(dealTag(five.lines[0].deals, 5), '2 free');

    const four = priceBagDeals([line(P1, 4)], [b3g2], CTX);
    assert.equal(four.discount, 0);
    assert.equal(four.hints.length, 1);
    assert.equal(four.hints[0].missing, 1);
    assert.equal(four.hints[0].free, 2);
    assert.equal(four.hints[0].kind, 'add-more');
  });

  it('J12b: Buy 3 get 2 with a mixed bag frees the two cheapest', () => {
    const b3g2 = bxgy('b3g2', { buy: { quantity: 3 }, get: { quantity: 2, percent: 100 } });
    const result = priceBagDeals([line(P1, 3), line(P3, 2)], [b3g2], CTX);
    assert.deepEqual(discounts(result), [0, 400]);
  });

  it('J20: two sizes of the same product count together (M x2 + L x1 gives 1 free)', () => {
    const tee = product('tee-sizes', TEES, 1000, { sizes: ['m', 'l'] });
    const result = priceBagDeals(
      [line(tee, 2, { variant: { id: 'm', size: 'm' } }), line(tee, 1, { variant: { id: 'l', size: 'l' } })],
      [B2G1],
      CTX,
    );
    assert.equal(result.discount, 1000);
    assert.equal(
      result.lines.reduce((sum, entry) => sum + entry.discountedUnits, 0),
      1,
    );
  });

  it('partial size match: an offer on size M only does not count the L piece', () => {
    const tee = product('tee-sizes', TEES, 1000, { sizes: ['m', 'l'] });
    const onlyM = bxgy('only-m', {}, { conditions: { anyOf: [{ allOf: [{ field: 'sizes', in: ['m'] }] }] } });
    const bag = [
      line(tee, 2, { variant: { id: 'm', size: 'm' } }),
      line(tee, 1, { variant: { id: 'l', size: 'l' } }),
    ];
    const result = priceBagDeals(bag, [onlyM], CTX);
    assert.equal(result.discount, 0);
    // Two M pieces qualify: one more M piece would complete the group.
    assert.equal(result.hints[0].missing, 1);
    assert.equal(result.hints[0].lineIndex, 0);
    // With a third M piece the group is complete.
    const withThirdM = priceBagDeals([line(tee, 3, { variant: { id: 'm', size: 'm' } })], [onlyM], CTX);
    assert.equal(withThirdM.discount, 1000);
  });

  it('partial colour match: a line with no variant chosen counts, a white variant of a black-only offer does not', () => {
    const tee = product('tee-colours', TEES, 1000, { colors: ['black', 'white'] });
    const blackOnly = bxgy(
      'black-only',
      {},
      { conditions: { anyOf: [{ allOf: [{ field: 'colors', in: ['black'] }] }] } },
    );
    const noVariant = priceBagDeals([line(tee, 3)], [blackOnly], CTX);
    assert.equal(noVariant.discount, 1000);
    const whiteVariant = priceBagDeals(
      [line(tee, 3, { variant: { id: 'w', color: 'white' } })],
      [blackOnly],
      CTX,
    );
    assert.equal(whiteVariant.discount, 0);
    const blackVariant = priceBagDeals(
      [line(tee, 3, { variant: { id: 'b', color: 'black' } })],
      [blackOnly],
      CTX,
    );
    assert.equal(blackVariant.discount, 1000);
  });

  it('empty rules mean every product qualifies', () => {
    const everything = bxgy('all', {}, { conditions: EVERYTHING });
    const result = priceBagDeals([line(RACKET_3000), line(GRIP_100), line(BAG_400)], [everything], CTX);
    assert.deepEqual(discounts(result), [0, 100, 0]);
  });

  it('exclude removes a product from the offer even when the include rules match it', () => {
    const noP3 = bxgy('no-p3', {}, { exclude: ids('productId', ['p3']) });
    // P3 (cheapest) is excluded, so the free piece is a P1 piece.
    const result = priceBagDeals([line(P1, 2), line(P3, 1)], [noP3], CTX);
    assert.deepEqual(discounts(result), [0, 0]);
    assert.equal(result.hints[0].missing, 1);
    const withThird = priceBagDeals([line(P1, 3), line(P3, 1)], [noP3], CTX);
    assert.deepEqual(discounts(withThird), [1000, 0]);
  });

  it('include rules: a product outside them is never counted or discounted', () => {
    const result = priceBagDeals([line(P1, 2), line(BAG_400, 1)], [B2G1], CTX);
    assert.equal(result.discount, 0);
    assert.equal(result.lines[1].dealUnits, 0);
  });

  it('a quantity of 0 or less adds nothing, and a fractional quantity is rounded down', () => {
    const zero = priceBagDeals([line(P1, 0)], [B2G1], CTX);
    assert.equal(zero.lines[0].total, 0);
    assert.deepEqual(zero.hints, []);
    const fractional = priceBagDeals([line(P1, 2.9)], [B2G1], CTX);
    assert.equal(fractional.discount, 0);
    assert.equal(fractional.hints[0].missing, 1);
  });

  it('J-rounding: a percentage is rounded to whole EGP per piece', () => {
    assert.equal(unitDiscount(333, 50), 167);
    assert.equal(unitDiscount(999, 33), 330);
    assert.equal(unitDiscount(1, 50), 1);
    assert.equal(unitDiscount(100, 100), 100);
    assert.equal(unitDiscount(100, 150), 100);
    assert.equal(unitDiscount(100, 0), 0);
    const odd = product('odd', TEES, 999);
    const result = priceBagDeals([line(odd, 3)], [bxgy('third', { get: { quantity: 1, percent: 33 } })], CTX);
    assert.equal(result.discount, 330);
    assert.equal(result.lines[0].total, 3 * 999 - 330);
  });

  it('J26: a percentage outside 1-100 is an error on save, and pricing never turns 0 into 100', () => {
    const draft = (percent, buy = 2, get = 1) =>
      bxgy('invalid', { buy: { quantity: buy }, get: { quantity: get, percent } });
    const codes = (offer) => validateOffer(offer, [P1], [], CTX).errors.map((error) => error.code);
    assert.deepEqual(codes(draft(0)), ['reward.getPercent']);
    assert.deepEqual(codes(draft(150)), ['reward.getPercent']);
    assert.deepEqual(codes(draft(100)), []);
    assert.deepEqual(codes(draft(1)), []);
    assert.deepEqual(codes(draft(50, 0, 0)), ['reward.buyQuantity', 'reward.getQuantity']);

    // Pricing never makes a piece free because the percentage was typed as 0 (ATS-142).
    const zero = priceBagDeals([line(P1, 3)], [draft(0)], CTX);
    assert.notEqual(zero.discount, 1000);
    assert.ok(zero.discount < 1000);
    // 150 is read as 100 (free), so a stored bad value cannot over-discount.
    const high = priceBagDeals([line(P1, 3)], [draft(150)], CTX);
    assert.equal(high.discount, 1000);
    // 0 for buy and get is read as 1.
    const zeroQuantities = priceBagDeals([line(P1, 2)], [draft(100, 0, 0)], CTX);
    assert.equal(zeroQuantities.discount, 1000);
  });

  it('J22: the product page price is not reduced by a Buy X get Y offer', () => {
    const result = displayPrice(P1, [B2G1], CTX);
    assert.equal(result.fromPrice, 1000);
    assert.equal(result.listPrice, 1000);
    assert.equal(result.maxDiscountPercent, 0);
    assert.deepEqual(result.offerIds, ['b2g1']);
    assert.equal(priceItem(P1, null, [B2G1], CTX).effectivePrice, 1000);
  });
});

// ---------------------------------------------------------------------------------------------
// J13-J19: free item from products, or a category / brand
// ---------------------------------------------------------------------------------------------

describe('J13-J19: free item rules', () => {
  const BUY_P1 = ids('productId', ['p1']);
  const FREE_P3 = bxgy('free-p3', { getConditions: ids('productId', ['p3']) }, { conditions: BUY_P1 });

  it('J13: buy 2 of P1, the free item must be P3: a nudge lists P3, tapping adds it for free', () => {
    const result = priceBagDeals([line(P1, 2)], [FREE_P3], CTX);
    assert.equal(result.discount, 0);
    assert.deepEqual(result.hints, [
      {
        kind: 'choose-free',
        offerId: 'free-p3',
        title: 'Buy 2, get 1 free',
        lineIndex: 0,
        missing: 1,
        free: 1,
        percent: 100,
        samePool: false,
        productIds: ['p3'],
      },
    ]);
    assert.equal(freeItemWins([line(P1, 2)], [FREE_P3], CTX, 'free-p3', line(P3)), true);
    const added = priceBagDeals([line(P1, 2), line(P3)], [FREE_P3], CTX);
    assert.deepEqual(discounts(added), [0, 200]);
    assert.equal(dealTag(added.lines[1].deals, 1), 'Free');
    assert.deepEqual(added.hints, []);
  });

  it('J13b: a third P1 piece is not free: the free item must be on the list', () => {
    const result = priceBagDeals([line(P1, 3)], [FREE_P3], CTX);
    assert.equal(result.discount, 0);
    assert.equal(result.hints[0].kind, 'choose-free');
  });

  it('J15: free item by category: any item of that category is free', () => {
    const socks = product('socks-a', ['accessories', 'socks'], 150);
    const rule = bxgy('cat-free', { getConditions: ids('categoryIds', ['socks']) }, { conditions: BUY_P1 });
    const result = priceBagDeals([line(P1, 2), line(socks, 1)], [rule], CTX);
    assert.deepEqual(discounts(result), [0, 150]);
    // An item outside the category is not free.
    const grip = priceBagDeals([line(P1, 2), line(GRIP_100, 1)], [rule], CTX);
    assert.equal(grip.discount, 0);
  });

  it('J15b: a category group plus a brand group: either one can be the free item', () => {
    const babolat = product('babolat-cap', ['accessories', 'caps'], 300, { brandId: 'babolat' });
    const socks = product('socks-b', ['accessories', 'socks'], 150);
    const rule = bxgy(
      'cat-or-brand',
      {
        getConditions: {
          anyOf: [
            { allOf: [{ field: 'categoryIds', in: ['socks'] }] },
            { allOf: [{ field: 'brandId', in: ['babolat'] }] },
          ],
        },
      },
      { conditions: BUY_P1 },
    );
    assert.deepEqual(discounts(priceBagDeals([line(P1, 2), line(babolat)], [rule], CTX)), [0, 300]);
    assert.deepEqual(discounts(priceBagDeals([line(P1, 2), line(socks)], [rule], CTX)), [0, 150]);
    assert.equal(canBeFreeItem(rule, babolat, false), true);
    assert.equal(canBeFreeItem(rule, socks, false), true);
    assert.equal(canBeFreeItem(rule, GRIP_100, false), false);
  });

  it('J14/J16: a free-item rule with nothing picked cannot be saved', () => {
    const codes = (getConditions) =>
      validateOffer(bxgy('x', { getConditions }), [P1], [], CTX).errors.map((error) => [
        error.code,
        error.message,
      ]);
    assert.deepEqual(codes({ anyOf: [{ allOf: [{ field: 'productId', in: [] }] }] }), [
      ['reward.freeItemProducts', 'Pick at least one product that can be the free item.'],
    ]);
    assert.deepEqual(codes({ anyOf: [{ allOf: [{ field: 'categoryIds', in: [] }] }] }), [
      ['reward.freeItemGroup', 'Pick at least one category or brand for the free item.'],
    ]);
    assert.deepEqual(codes({ anyOf: [] }), [
      ['reward.freeItemGroup', 'Pick at least one category or brand for the free item.'],
    ]);
    assert.deepEqual(codes(null), []);
    assert.deepEqual(codes(ids('productId', ['p3'])), []);
    assert.deepEqual(codes(ids('brandId', ['babolat'])), []);
  });

  it('J17: the free item can cost more than what was bought (P3 x2 bought, P1 free)', () => {
    const rule = bxgy(
      'dear-free',
      { getConditions: ids('productId', ['p1']) },
      { conditions: ids('productId', ['p3']) },
    );
    const result = priceBagDeals([line(P3, 2), line(P1, 1)], [rule], CTX);
    assert.deepEqual(discounts(result), [0, 1000]);
    assert.deepEqual(totals(result), [400, 0]);
  });

  it('J18: the free-item product list reads back as the same list', () => {
    assert.deepEqual(freeItemProductIds(FREE_P3.reward.getConditions), ['p3']);
    assert.deepEqual(
      freeItemProductIds({
        anyOf: [
          { allOf: [{ field: 'productId', in: ['p3'] }] },
          { allOf: [{ field: 'productId', in: ['p3', 'p4'] }] },
        ],
      }),
      ['p3', 'p4'],
    );
  });

  it('J18b: only a pure product list counts as a list', () => {
    assert.equal(freeItemProductIds(null), null);
    assert.equal(freeItemProductIds({ anyOf: [] }), null);
    assert.equal(freeItemProductIds(ids('categoryIds', ['grips'])), null);
    assert.equal(freeItemProductIds(ids('productId', [])), null);
    assert.equal(
      freeItemProductIds({
        anyOf: [
          {
            allOf: [
              { field: 'productId', in: ['p3'] },
              { field: 'brandId', in: ['x'] },
            ],
          },
        ],
      }),
      null,
    );
    assert.equal(
      freeItemProductIds({ anyOf: [{ allOf: [{ field: 'productId', in: ['p3'], notIn: ['p9'] }] }] }),
      null,
    );
  });

  it('J19: a product that is not on the free list is not offered as the free item', () => {
    assert.equal(canBeFreeItem(FREE_P3, P3, false), true);
    assert.equal(canBeFreeItem(FREE_P3, P1, false), false);
    // The nudge lists only the product that can still be chosen.
    assert.deepEqual(priceBagDeals([line(P1, 2)], [FREE_P3], CTX).hints[0].productIds, ['p3']);
  });

  it('J19b: an offer that is not Buy X get Y never offers a free item', () => {
    assert.equal(canBeFreeItem(itemOffer('ten', { kind: 'percentOff', percent: 10 }), P3, false), false);
  });

  it('a free-item list picks the cheapest listed pieces when several are in the bag', () => {
    const rule = bxgy(
      'list-two',
      {
        buy: { quantity: 1 },
        get: { quantity: 2, percent: 100 },
        getConditions: ids('productId', ['grip-150', 'grip-120', 'grip-100']),
      },
      { conditions: RACKETS },
    );
    const result = priceBagDeals(
      [line(RACKET_3000), line(GRIP_150), line(GRIP_120), line(GRIP_100)],
      [rule],
      CTX,
    );
    assert.deepEqual(discounts(result), [0, 0, 120, 100]);
  });

  it('with repeat off a second racket does not give a second free grip', () => {
    const rule = bxgy(
      'one-grip',
      { buy: { quantity: 1 }, repeat: false, getConditions: ids('productId', ['grip-150', 'grip-120']) },
      { conditions: RACKETS },
    );
    const result = priceBagDeals([line(RACKET_3000, 2), line(GRIP_150), line(GRIP_120)], [rule], CTX);
    assert.deepEqual(discounts(result), [0, 0, 120]);
    assert.deepEqual(result.hints, []);
    const repeating = bxgy(
      'two-grips',
      { buy: { quantity: 1 }, repeat: true, getConditions: ids('productId', ['grip-150', 'grip-120']) },
      { conditions: RACKETS },
    );
    const both = priceBagDeals([line(RACKET_3000, 2), line(GRIP_150), line(GRIP_120)], [repeating], CTX);
    assert.deepEqual(discounts(both), [0, 150, 120]);
  });
});

// ---------------------------------------------------------------------------------------------
// I7, J21, O10: sale items, gift vs deal
// ---------------------------------------------------------------------------------------------

describe('I7: Buy X get Y and products already on sale', () => {
  it('"Skip products already on sale": three P2 pieces earn no free piece', () => {
    const skip = bxgy('skip', {}, { saleItems: 'exclude' });
    const result = priceBagDeals([bagLine(P2, 3)], [skip], CTX);
    assert.equal(result.discount, 0);
    assert.deepEqual(totals(result), [2400]);
    assert.deepEqual(result.hints, []);
  });

  it('"Skip products already on sale": only the full-price pieces count', () => {
    const skip = bxgy('skip', {}, { saleItems: 'exclude' });
    const result = priceBagDeals([bagLine(P1, 2), bagLine(P2, 1)], [skip], CTX);
    assert.equal(result.discount, 0);
    // One more full-price piece completes the group; the sale piece does not count.
    assert.equal(result.hints[0].missing, 1);
    assert.equal(result.hints[0].lineIndex, 0);
    const three = priceBagDeals([bagLine(P1, 3), bagLine(P2, 1)], [skip], CTX);
    assert.deepEqual(discounts(three), [1000, 0]);
  });

  it('"Best discount wins": a sale piece takes part and the discount is on its sale price (800)', () => {
    const bestOf = bxgy('best', {}, { saleItems: 'bestOf' });
    const result = priceBagDeals([bagLine(P2, 3)], [bestOf], CTX);
    assert.equal(result.discount, 800);
    assert.deepEqual(totals(result), [1600]);
  });

  it('a sale piece mixed with full-price pieces: the cheapest (the sale one) is free', () => {
    const result = priceBagDeals([bagLine(P1, 2), bagLine(P2, 1)], [bxgy('best')], CTX);
    assert.deepEqual(discounts(result), [0, 800]);
  });

  it('J-sale: skip-sale flag also decides the free item', () => {
    const rule = bxgy(
      'rg-skip',
      { buy: { quantity: 1 }, getConditions: ids('productId', ['grip-100', 'grip-150']) },
      { conditions: RACKETS, saleItems: 'exclude' },
    );
    const saleGrip = line(GRIP_100, 1, { onSale: true });
    const result = priceBagDeals([line(RACKET_3000), saleGrip, line(GRIP_150)], [rule], CTX);
    // The cheaper grip is on sale, so it is skipped: the 150 grip is free.
    assert.deepEqual(discounts(result), [0, 0, 150]);
  });
});

describe('J21 / O10: a free gift and a Buy X get Y discount never go to the same piece', () => {
  const B2G1 = bxgy('b2g1');

  it('gifts worth less than the discount: the free piece gets no gift, the others keep theirs', () => {
    const result = priceBagDeals([line(P1, 3, { giftWorth: 400 })], [B2G1], CTX);
    assert.equal(result.discount, 1000);
    assert.equal(result.lines[0].discountedUnits, 1);
    assert.equal(result.lines[0].giftUnits, 2);
  });

  it('gifts worth more than the discount: nothing is discounted and every piece keeps its gifts', () => {
    const result = priceBagDeals([line(P1, 3, { giftWorth: 1200 })], [B2G1], CTX);
    assert.equal(result.discount, 0);
    assert.equal(result.lines[0].giftUnits, 3);
    assert.deepEqual(result.offerIds, []);
  });

  it('gifts worth exactly the discount: the gift wins the tie', () => {
    const result = priceBagDeals([line(P1, 3, { giftWorth: 1000 })], [B2G1], CTX);
    assert.equal(result.discount, 0);
    assert.equal(result.lines[0].giftUnits, 3);
  });

  it('50% off compared with the gift: 500 off beats gifts worth 400, gifts worth 600 beat 500 off', () => {
    const half = bxgy('half', { get: { quantity: 1, percent: 50 } });
    assert.equal(priceBagDeals([line(P1, 3, { giftWorth: 400 })], [half], CTX).discount, 500);
    assert.equal(priceBagDeals([line(P1, 3, { giftWorth: 600 })], [half], CTX).discount, 0);
  });

  it('only the line without gifts gives the free piece; the line with big gifts keeps them', () => {
    const result = priceBagDeals([line(P1, 1, { giftWorth: 1500 }), line(P1, 2)], [B2G1], CTX);
    assert.deepEqual(discounts(result), [0, 1000]);
    assert.equal(result.lines[0].giftUnits, 1);
    assert.equal(result.lines[1].giftUnits, 1);
    assert.equal(result.lines[1].discountedUnits, 1);
  });

  it('a line with no gifts at all keeps giftUnits equal to its undiscounted pieces', () => {
    const result = priceBagDeals([line(P1, 6)], [B2G1], CTX);
    assert.equal(result.lines[0].giftUnits, 4);
    assert.equal(result.lines[0].discountedUnits, 2);
  });
});

// ---------------------------------------------------------------------------------------------
// One discount per item (ATS-137), J27, O11, O12
// ---------------------------------------------------------------------------------------------

describe('ATS-137 / J27: one discount per item, the bigger saving wins', () => {
  const B2G1 = bxgy('b2g1');

  it('J27: 10% off and Buy 2 get 1 free on three 1,000 pieces pays 2,000 (never 1,800)', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const result = priceBagDeals([bagLine(P1, 3, [ten])], [B2G1], CTX);
    assert.equal(result.lines[0].total, 2000);
    assert.equal(result.lines[0].before, 3000);
    assert.equal(result.discount, 1000);
    assert.equal(dealTag(result.lines[0].deals, 3), '1 free');
  });

  it('a fourth piece outside the group keeps its 10% price (900)', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const result = priceBagDeals([bagLine(P1, 4, [ten])], [B2G1], CTX);
    assert.equal(result.lines[0].total, 2900);
    assert.equal(result.lines[0].dealUnits, 3);
    assert.equal(result.lines[0].offerUnits, 1);
  });

  it('Amount off 200 (saves 600 on three) loses to a free 1,000 piece', () => {
    const amount = itemOffer('amount', { kind: 'amountOff', amount: 200 });
    assert.equal(priceBagDeals([bagLine(P1, 3, [amount])], [B2G1], CTX).lines[0].total, 2000);
  });

  it('Set price 700 (saves 900 on three) loses to a free 1,000 piece', () => {
    const fixed = itemOffer('fixed', { kind: 'fixedPrice', price: 700 });
    assert.equal(priceBagDeals([bagLine(P1, 3, [fixed])], [B2G1], CTX).lines[0].total, 2000);
  });

  it('Set price 600 (saves 1,200 on three) beats a free 1,000 piece: the deal does not apply', () => {
    const fixed = itemOffer('fixed', { kind: 'fixedPrice', price: 600 });
    const result = priceBagDeals([bagLine(P1, 3, [fixed])], [B2G1], CTX);
    assert.equal(result.lines[0].total, 1800);
    assert.equal(result.discount, 0);
    assert.deepEqual(result.offerIds, []);
    assert.deepEqual(result.lines[0].deals, []);
  });

  it('34% off (saves 1,020 on three) beats the free piece, 33% off (990) does not', () => {
    const p34 = itemOffer('p34', { kind: 'percentOff', percent: 34 });
    const p33 = itemOffer('p33', { kind: 'percentOff', percent: 33 });
    assert.equal(priceBagDeals([bagLine(P1, 3, [p34])], [B2G1], CTX).lines[0].total, 3 * 660);
    assert.equal(priceBagDeals([bagLine(P1, 3, [p33])], [B2G1], CTX).lines[0].total, 2000);
  });

  it('a tie (amount off 500 on two pieces vs Buy 1 get 1 free) keeps the per-item offer', () => {
    const amount = itemOffer('amount', { kind: 'amountOff', amount: 500 });
    const b1g1 = bxgy('b1g1', { buy: { quantity: 1 } });
    const result = priceBagDeals([bagLine(P1, 2, [amount])], [b1g1], CTX);
    assert.equal(result.lines[0].total, 1000);
    assert.deepEqual(result.offerIds, []);
    assert.equal(result.discount, 0);
  });

  it('several groups: only the groups where the deal saves more are taken (max 1 group)', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const one = bxgy('one', { maxApplications: 1 });
    const result = priceBagDeals([bagLine(P1, 6, [ten])], [one], CTX);
    assert.equal(result.lines[0].total, 2000 + 3 * 900);
    assert.equal(result.lines[0].dealUnits, 3);
    assert.equal(result.lines[0].offerUnits, 3);
  });

  it('with repeat on every group beats 10% off: six pieces pay 4,000', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const result = priceBagDeals([bagLine(P1, 6, [ten])], [B2G1], CTX);
    assert.equal(result.lines[0].total, 4000);
  });

  it('the discount comes off the price before per-item offers, so a deal piece pays 1,000 first', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const result = priceBagDeals(
      [bagLine(P1, 3, [ten])],
      [bxgy('half', { get: { quantity: 1, percent: 50 } })],
      CTX,
    );
    // 50% of 1,000 = 500 vs 10% off three pieces = 300: the deal wins, total 3,000 - 500.
    assert.equal(result.lines[0].total, 2500);
  });

  it('the free piece is the one whose per-item offer saves least (the full-price one)', () => {
    const b1g1 = bxgy('b1g1', { buy: { quantity: 1 } });
    const result = priceBagDeals(
      [line(P1, 1, { offerPrice: 800 }), line(P1, 1, { offerPrice: 1000 })],
      [b1g1],
      CTX,
    );
    assert.equal(result.lines[1].discount, 1000);
    assert.equal(result.lines[0].discount, 0);
    // The paid piece gives up its 20% offer: it pays 1,000.
    assert.equal(result.lines[0].total, 1000);
    assert.equal(result.lines[0].dealUnits, 1);
  });

  it('a per-item offer on only some lines: each group is compared on its own pieces', () => {
    const half = itemOffer('half', { kind: 'percentOff', percent: 50 });
    const result = priceBagDeals(
      [bagLine(P1, 3, [half]), bagLine(product('p1b', TEES, 1000), 3)],
      [B2G1],
      CTX,
    );
    // Pieces without an offer make the winning group; the half-price ones keep half price.
    assert.deepEqual(totals(result), [1500, 2000]);
  });

  it('a sale piece of a per-item offer: the deal is worked out on its sale price (800)', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 }, { saleItems: 'bestOf' });
    // 10% of the old price 1,000 = 900 is worse than the sale 800: the piece stays 800.
    const sale = bagLine(P2, 3, [ten]);
    assert.equal(sale.basePrice, 800);
    assert.equal(sale.offerPrice, 800);
    const result = priceBagDeals([sale], [B2G1], CTX);
    assert.equal(result.lines[0].total, 1600);
  });

  it('O11: 10% off and a free gift come together; the gift is not a discount', () => {
    const ten = itemOffer(
      'ten',
      { kind: 'percentOff', percent: 10 },
      { conditions: ids('categoryIds', ['bags']) },
    );
    const gift = giftOffer('gift', [SHIRT_GIFT]);
    assert.equal(priceItem(BAG_3000, null, [ten, gift], CTX).effectivePrice, 2700);
    const offer = giftOfferForProduct(BAG_3000, null, [ten, gift], CTX, ALL_IN_STOCK);
    assert.equal(offer?.offerId, 'gift');
    const priced = priceBagDeals([bagLine(BAG_3000, 1, [ten, gift], { giftWorth: 300 })], [ten, gift], CTX);
    assert.equal(priced.lines[0].total, 2700);
    assert.equal(priced.lines[0].giftUnits, 1);
    assert.equal(priced.discount, 0);
  });

  it('O12: free shipping minimum counts the subtotal after item offers (2,700 < 3,000)', () => {
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const freeShipping = parseOfferDoc('free-ship', {
      name: 'Free shipping',
      title: 'Free shipping over 3,000',
      active: true,
      scope: 'cart',
      conditions: EVERYTHING,
      minimum: { subtotal: 3000 },
      reward: { kind: 'freeShipping' },
    });
    const box = {
      id: 'box1',
      name: 'Box 1',
      maxWeightGrams: 3000,
      maxLengthCm: 40,
      maxWidthCm: 30,
      maxHeightCm: 20,
      feeEgp: 115,
    };
    const settings = {
      currency: 'EGP',
      egyptBoxes: [box],
      internationalBoxes: [],
      freeOver: { active: false, threshold: null },
      promo: { active: false, fee: 0, startsAt: null, endsAt: null, minSubtotal: null, banner: null },
      note: '',
    };
    const quote = (quantity) => {
      const subtotal = priceBagDeals([bagLine(P1, quantity, [ten])], [], CTX).lines[0].total;
      return {
        subtotal,
        quote: shippingQuote(
          settings,
          { region: 'egypt', totalWeightGrams: 750, goodsSubtotal: subtotal, lines: [P1] },
          [freeShipping],
          CTX,
        ),
      };
    };
    const three = quote(3);
    assert.equal(three.subtotal, 2700);
    assert.equal(three.quote.fee, 115);
    assert.equal(three.quote.reason, 'box');
    // Four pieces: 3,600 after the offer: free.
    const four = quote(4);
    assert.equal(four.subtotal, 3600);
    assert.equal(four.quote.fee, 0);
    assert.equal(four.quote.reason, 'offer');
  });
});

// ---------------------------------------------------------------------------------------------
// O9: two Buy X get Y offers
// ---------------------------------------------------------------------------------------------

describe('O9: two Buy X get Y offers on the same items', () => {
  const A = bxgy('offer-a', {}, { priority: 10, title: 'Buy 2, get 1 free' });
  const B = bxgy(
    'offer-b',
    { buy: { quantity: 1 }, get: { quantity: 1, percent: 50 } },
    { priority: 0, title: 'Buy 1, get 1 at 50% off' },
  );

  it('the higher priority applies first and its pieces are not used again', () => {
    const result = priceBagDeals([line(P1, 3)], [B, A], CTX);
    assert.equal(result.discount, 1000);
    assert.deepEqual(result.offerIds, ['offer-a']);
    assert.deepEqual(result.lines[0].deals, [{ offerId: 'offer-a', units: 1, percent: 100, discount: 1000 }]);
    assert.deepEqual(result.hints, []);
    assert.equal(result.lines[0].total, 2000);
  });

  it('the leftover piece asks for what each offer still needs', () => {
    const result = priceBagDeals([line(P1, 4)], [A, B], CTX);
    assert.equal(result.discount, 1000);
    const byOffer = Object.fromEntries(result.hints.map((hint) => [hint.offerId, hint.missing]));
    assert.deepEqual(byOffer, { 'offer-a': 2, 'offer-b': 1 });
  });

  it('the second offer takes the pieces the first one left: five pieces, 1 free and 1 at -50%', () => {
    const result = priceBagDeals([line(P1, 5)], [A, B], CTX);
    assert.equal(result.discount, 1500);
    assert.equal(result.lines[0].total, 3500);
    assert.deepEqual(result.lines[0].deals, [
      { offerId: 'offer-a', units: 1, percent: 100, discount: 1000 },
      { offerId: 'offer-b', units: 1, percent: 50, discount: 500 },
    ]);
    assert.equal(dealTag(result.lines[0].deals, 5), '1 free · 1 at −50%');
    assert.deepEqual([...result.offerIds].sort(), ['offer-a', 'offer-b']);
  });

  it('priority decides, not the bigger saving: a higher-priority 50% offer goes first', () => {
    const bFirst = { ...B, priority: 20 };
    const result = priceBagDeals([line(P1, 3)], [A, bFirst], CTX);
    // B takes 2 pieces (500 off); one piece is left, so A cannot give its free piece.
    assert.equal(result.discount, 500);
    assert.deepEqual(result.offerIds, ['offer-b']);
  });

  it('equal priority: the newest edit goes first', () => {
    const older = { ...A, priority: 0, updatedAtMs: 1000 };
    const newer = { ...B, priority: 0, updatedAtMs: 2000 };
    const result = priceBagDeals([line(P1, 3)], [older, newer], CTX);
    assert.deepEqual(result.offerIds, ['offer-b']);
    const reversed = priceBagDeals([line(P1, 3)], [{ ...older, updatedAtMs: 3000 }, newer], CTX);
    assert.deepEqual(reversed.offerIds, ['offer-a']);
  });

  it('equal priority and edit time: the id order decides, whatever the list order', () => {
    const a = { ...A, priority: 0, updatedAtMs: 5 };
    const b = { ...B, priority: 0, updatedAtMs: 5 };
    assert.deepEqual(priceBagDeals([line(P1, 3)], [b, a], CTX).offerIds, ['offer-a']);
    assert.deepEqual(priceBagDeals([line(P1, 3)], [a, b], CTX).offerIds, ['offer-a']);
  });

  it('two Buy X get Y offers both lose to a half-price per-item offer: nothing is taken', () => {
    const half = itemOffer('half', { kind: 'percentOff', percent: 50 });
    const tenPercentDeal = bxgy('ten', { get: { quantity: 1, percent: 10 } }, { priority: 5 });
    const free = bxgy('free', {}, { priority: 1 });
    const result = priceBagDeals([bagLine(P1, 3, [half])], [tenPercentDeal, free], CTX);
    // 100 off one piece is worse than half price on all three; a free piece (1,000) is not worse
    // than the 1,500 half price saves, so both lose: the per-item offer stays.
    assert.equal(result.lines[0].total, 1500);
    assert.deepEqual(result.offerIds, []);
  });

  it('offers that are not live give nothing: paused, archived, ended, not started, wrong audience', () => {
    const run = (overrides) => priceBagDeals([line(P1, 3)], [{ ...A, ...overrides }], VISITOR).discount;
    assert.equal(run({}), 1000);
    assert.equal(run({ active: false }), 0);
    assert.equal(run({ archived: true }), 0);
    assert.equal(run({ audience: 'signedIn' }), 0);
    assert.equal(
      run({
        schedule: { startsAt: new Date('2026-11-11T00:00:00Z'), endsAt: null, timezone: 'Africa/Cairo' },
      }),
      0,
    );
    assert.equal(
      run({
        schedule: { startsAt: null, endsAt: new Date('2026-11-10T11:00:00Z'), timezone: 'Africa/Cairo' },
      }),
      0,
    );
    // A coupon-code offer needs its code.
    assert.equal(run({ requiresCode: true, code: 'SAVE' }), 0);
    assert.equal(
      priceBagDeals([line(P1, 3)], [{ ...A, requiresCode: true, code: 'SAVE' }], {
        ...VISITOR,
        codes: ['save'],
      }).discount,
      1000,
    );
  });

  it('schedule edges: live at exactly startsAt, over at exactly endsAt', () => {
    const at = (startsAt, endsAt) =>
      priceBagDeals([line(P1, 3)], [{ ...A, schedule: { startsAt, endsAt, timezone: 'Africa/Cairo' } }], CTX)
        .discount;
    assert.equal(at(NOW, null), 1000);
    assert.equal(at(null, NOW), 0);
    assert.equal(at(null, new Date(NOW.getTime() + 1)), 1000);
    assert.equal(at(new Date(NOW.getTime() + 1), null), 0);
  });

  it('only per-item offers with no spend or quantity minimum give discounts in the bag', () => {
    const run = (overrides) => priceBagDeals([line(P1, 3)], [{ ...A, ...overrides }], CTX).discount;
    assert.equal(run({ scope: 'cart' }), 0);
    assert.equal(run({ minimum: { subtotal: 1 } }), 0);
    assert.equal(run({ minimum: { quantity: 2 } }), 0);
    assert.equal(run({ minimum: { subtotal: 0, quantity: 0 } }), 1000);
    assert.equal(run({ minimum: null }), 1000);
  });
});

// ---------------------------------------------------------------------------------------------
// Rule 8: racket + grip, racket + bag (ATS-148)
// ---------------------------------------------------------------------------------------------

describe('rule 8: the bag only promises a free item it will really give', () => {
  // 10% off a 5,000 racket would save 500; Amount off 500 gives the same saving.
  const amount500 = itemOffer('amount-500', { kind: 'amountOff', amount: 500 }, { conditions: RACKETS });
  const racketOffered = () => bagLine(RACKET_5000, 1, [amount500]);
  const GRIPS = ['grip-300', 'grip-500', 'grip-600'];
  const RACKET_GRIP = bxgy(
    'racket-grip',
    { buy: { quantity: 1 }, getConditions: ids('productId', GRIPS) },
    { conditions: RACKETS, title: 'Buy a racket, get a free grip' },
  );
  const RACKET_BAG = bxgy(
    'racket-bag',
    { buy: { quantity: 1 }, getConditions: ids('categoryIds', ['bags']) },
    { conditions: RACKETS, title: 'Buy a racket, get a free bag' },
  );

  it('racket 5,000 with 500 off: a 300 grip is not free, a 500 grip ties (not free), a 600 grip is free', () => {
    const wins = (grip) => freeItemWins([racketOffered()], [RACKET_GRIP], CTX, 'racket-grip', line(grip));
    assert.equal(wins(GRIP_300), false);
    assert.equal(wins(GRIP_500), false);
    assert.equal(wins(GRIP_600), true);
  });

  it('racket + 300 grip in the bag: the racket keeps its offer, the grip pays, no "earns" promise', () => {
    const result = priceBagDeals([racketOffered(), line(GRIP_300)], [RACKET_GRIP], CTX);
    assert.deepEqual(totals(result), [4500, 300]);
    assert.deepEqual(result.offerIds, []);
    assert.deepEqual(
      result.lines.map((entry) => entry.earns),
      [[], []],
    );
  });

  it('racket + 600 grip: the racket pays full price and the grip is free, with a promise on the racket', () => {
    const result = priceBagDeals([racketOffered(), line(GRIP_600)], [RACKET_GRIP], CTX);
    assert.deepEqual(totals(result), [5000, 0]);
    assert.deepEqual(result.lines[0].earns, [
      { offerId: 'racket-grip', units: 1, percent: 100, freeLines: [1] },
    ]);
    assert.deepEqual(result.offerIds, ['racket-grip']);
    assert.equal(dealTag(result.lines[1].deals, 1), 'Free');
  });

  it('racket + grip with no offer on the racket: any listed grip is free, even a 100 one', () => {
    const rule = bxgy(
      'racket-grip-all',
      { buy: { quantity: 1 }, getConditions: ids('productId', ['grip-100']) },
      { conditions: RACKETS },
    );
    const result = priceBagDeals([line(RACKET_3000), line(GRIP_100)], [rule], CTX);
    assert.deepEqual(totals(result), [3000, 0]);
    assert.deepEqual(result.lines[0].earns, [
      { offerId: 'racket-grip-all', units: 1, percent: 100, freeLines: [1] },
    ]);
  });

  it('racket alone: the nudge lists the grips to choose from (checked per grip with freeItemWins)', () => {
    const plain = priceBagDeals([line(RACKET_5000)], [RACKET_GRIP], CTX);
    assert.equal(plain.hints.length, 1);
    assert.equal(plain.hints[0].kind, 'choose-free');
    assert.deepEqual(plain.hints[0].productIds, GRIPS);
    assert.equal(plain.hints[0].samePool, false);
    assert.equal(plain.hints[0].missing, 1);
  });

  it('racket + bag by category: a 400 bag is not free next to 500 off the racket', () => {
    const wins = (bag) => freeItemWins([racketOffered()], [RACKET_BAG], CTX, 'racket-bag', line(bag));
    assert.equal(wins(BAG_400), false);
    assert.equal(wins(BAG_3000), true);
    const result = priceBagDeals([racketOffered(), line(BAG_400)], [RACKET_BAG], CTX);
    assert.deepEqual(totals(result), [4500, 400]);
    assert.deepEqual(result.offerIds, []);
  });

  it('racket + 3,000 bag: the racket pays 5,000 and the bag is free ("earns" names the bag line)', () => {
    const result = priceBagDeals([racketOffered(), line(BAG_3000)], [RACKET_BAG], CTX);
    assert.deepEqual(totals(result), [5000, 0]);
    assert.deepEqual(result.lines[0].earns, [
      { offerId: 'racket-bag', units: 1, percent: 100, freeLines: [1] },
    ]);
  });

  it('a category free item gets no "add the bag" nudge while the racket offer saves anything', () => {
    // The free bag is unknown, so the bag cannot promise it.
    assert.deepEqual(priceBagDeals([racketOffered()], [RACKET_BAG], CTX).hints, []);
    // Without a per-item offer the promise is safe.
    const plain = priceBagDeals([line(RACKET_5000)], [RACKET_BAG], CTX);
    assert.equal(plain.hints.length, 1);
    assert.equal(plain.hints[0].kind, 'add-more');
    assert.equal(plain.hints[0].samePool, false);
    assert.equal(plain.hints[0].missing, 1);
  });

  it('the same item as the free piece: no "add more" nudge when the per-item offer would win', () => {
    const half = itemOffer('half', { kind: 'percentOff', percent: 50 });
    assert.deepEqual(priceBagDeals([bagLine(P1, 1, [half])], [bxgy('b2g1')], CTX).hints, []);
    const ten = itemOffer('ten', { kind: 'percentOff', percent: 10 });
    const withTen = priceBagDeals([bagLine(P1, 1, [ten])], [bxgy('b2g1')], CTX);
    assert.equal(withTen.hints.length, 1);
    assert.equal(withTen.hints[0].missing, 2);
  });

  it('a free item with 50% off is checked on its saving: 50% of 600 = 300 does not beat 500', () => {
    const halfOff = bxgy(
      'racket-grip-half',
      {
        buy: { quantity: 1 },
        get: { quantity: 1, percent: 50 },
        getConditions: ids('productId', ['grip-600', 'grip-300']),
      },
      { conditions: RACKETS },
    );
    const wins = (grip) => freeItemWins([racketOffered()], [halfOff], CTX, 'racket-grip-half', line(grip));
    assert.equal(wins(GRIP_600), false);
    assert.equal(wins(GRIP_300), false);
  });

  it('a free item that is on sale is not promised when the offer skips sale items', () => {
    const noSale = bxgy(
      'racket-grip-no-sale',
      { buy: { quantity: 1 }, getConditions: ids('productId', ['grip-600']) },
      { conditions: RACKETS, saleItems: 'exclude' },
    );
    assert.equal(
      freeItemWins(
        [line(RACKET_5000)],
        [noSale],
        CTX,
        'racket-grip-no-sale',
        line(GRIP_600, 1, { onSale: true }),
      ),
      false,
    );
    assert.equal(
      freeItemWins([line(RACKET_5000)], [noSale], CTX, 'racket-grip-no-sale', line(GRIP_600)),
      true,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// dealTag
// ---------------------------------------------------------------------------------------------

describe('dealTag', () => {
  it('names what the line gets', () => {
    assert.equal(dealTag([{ units: 1, percent: 100 }], 1), 'Free');
    assert.equal(dealTag([{ units: 2, percent: 100 }], 2), 'Free');
    assert.equal(dealTag([{ units: 1, percent: 100 }], 3), '1 free');
    assert.equal(dealTag([{ units: 2, percent: 100 }], 6), '2 free');
    assert.equal(dealTag([{ units: 2, percent: 50 }], 2), '−50%');
    assert.equal(dealTag([{ units: 1, percent: 50 }], 3), '1 at −50%');
    assert.equal(dealTag([{ units: 1, percent: 25 }], 1), '−25%');
  });

  it('is empty for no deals and skips an offer with no pieces', () => {
    assert.equal(dealTag([], 3), '');
    assert.equal(dealTag([{ units: 0, percent: 100 }], 3), '');
    assert.equal(
      dealTag(
        [
          { units: 0, percent: 100 },
          { units: 1, percent: 50 },
        ],
        3,
      ),
      '1 at −50%',
    );
  });

  it('joins several offers on one line with a middle dot', () => {
    assert.equal(
      dealTag(
        [
          { units: 1, percent: 100 },
          { units: 1, percent: 50 },
        ],
        5,
      ),
      '1 free · 1 at −50%',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// L. Free gifts (gifts.ts)
// ---------------------------------------------------------------------------------------------

describe('L: free gift offers for a product', () => {
  const bagOffer = (overrides = {}) => giftOffer('offer-bag', [SHIRT_GIFT, SOCKS_GIFT], overrides);

  it('L1/L2: one offer, two gifts, each with its choices, in the offer order', () => {
    const result = giftOfferForProduct(BAG_3000, null, [bagOffer()], CTX, ALL_IN_STOCK);
    assert.ok(result);
    assert.equal(result.offerId, 'offer-bag');
    assert.equal(result.title, 'Free shirt and socks');
    assert.deepEqual(
      result.gifts.map((gift) => [gift.id, gift.name, gift.productIds]),
      [
        ['shirt', 'Free shirt', ['tee-1', 'tee-2']],
        ['socks', 'Free socks', ['socks-1']],
      ],
    );
  });

  it('L5: a gift with one choice has exactly that choice (the shopper does not need to pick)', () => {
    const only = giftOffer('only-socks', [SOCKS_GIFT]);
    const result = giftOfferForProduct(BAG_3000, null, [only], CTX, ALL_IN_STOCK);
    assert.deepEqual(
      result?.gifts.map((gift) => gift.productIds),
      [['socks-1']],
    );
  });

  it('L8: a sold-out only choice hides that gift, and the offer when no gift is left', () => {
    const soldOutSocks = ALL_IN_STOCK.map((choice) =>
      choice.productId === 'socks-1' ? { ...choice, inStock: false } : choice,
    );
    const result = giftOfferForProduct(BAG_3000, null, [bagOffer()], CTX, soldOutSocks);
    assert.deepEqual(
      result?.gifts.map((gift) => gift.id),
      ['shirt'],
    );
    const none = giftOfferForProduct(
      BAG_3000,
      null,
      [giftOffer('only-socks', [SOCKS_GIFT])],
      CTX,
      soldOutSocks,
    );
    assert.equal(none, null);
  });

  it('L9: a gift that sells out after it was added is no longer given by the offer lookup', () => {
    const soldOut = ALL_IN_STOCK.map((choice) => ({ ...choice, inStock: choice.productId !== 'socks-1' }));
    const offer = giftOfferById('offer-bag', BAG_3000, null, [bagOffer()], CTX, soldOut);
    assert.deepEqual(
      offer?.gifts.map((gift) => gift.id),
      ['shirt'],
    );
    // Picking the sold-out socks is refused as "not allowed" now, never silently accepted.
    assert.deepEqual(checkGiftPicks(offer, [{ giftId: 'socks', productId: 'socks-1' }]), {
      ok: false,
      problem: 'unknown-gift',
    });
  });

  it('L10: an unpublished choice is not offered, a choice with no stock data is not offered either', () => {
    const result = giftOfferForProduct(BAG_3000, null, [bagOffer()], CTX, [
      { productId: 'tee-1', published: false, inStock: true },
      { productId: 'tee-2', published: true, inStock: true },
      { productId: 'socks-1', published: true, inStock: true },
    ]);
    assert.deepEqual(result?.gifts[0]?.productIds, ['tee-2']);
    const unknown = giftOfferForProduct(BAG_3000, null, [bagOffer()], CTX, [
      { productId: 'tee-2', published: true, inStock: true },
    ]);
    assert.deepEqual(
      unknown?.gifts.map((gift) => gift.id),
      ['shirt'],
    );
    assert.deepEqual(unknown?.gifts[0]?.productIds, ['tee-2']);
  });

  it('L17: two gift offers on one product: the higher priority shows; if its gifts sell out, the other shows', () => {
    const a = giftOffer('offer-a', [{ id: 'g', name: 'Free shirt', productIds: ['tee-1'] }], {
      priority: 10,
    });
    const b = giftOffer('offer-b', [{ id: 'g', name: 'Free socks', productIds: ['socks-1'] }], {
      priority: 0,
    });
    assert.equal(giftOfferForProduct(BAG_3000, null, [b, a], CTX, ALL_IN_STOCK)?.offerId, 'offer-a');
    const aSoldOut = ALL_IN_STOCK.map((choice) =>
      choice.productId === 'tee-1' ? { ...choice, inStock: false } : choice,
    );
    assert.equal(giftOfferForProduct(BAG_3000, null, [b, a], CTX, aSoldOut)?.offerId, 'offer-b');
  });

  it('L17b: equal priority goes to the newest edit, then the id', () => {
    const a = { ...giftOffer('offer-a', [SHIRT_GIFT]), updatedAtMs: 1000 };
    const b = { ...giftOffer('offer-b', [SHIRT_GIFT]), updatedAtMs: 2000 };
    assert.equal(giftOfferForProduct(BAG_3000, null, [a, b], CTX, ALL_IN_STOCK)?.offerId, 'offer-b');
    const sameTime = [
      { ...a, updatedAtMs: 5 },
      { ...b, updatedAtMs: 5 },
    ];
    assert.equal(giftOfferForProduct(BAG_3000, null, sameTime, CTX, ALL_IN_STOCK)?.offerId, 'offer-a');
    assert.equal(
      giftOfferForProduct(BAG_3000, null, [...sameTime].reverse(), CTX, ALL_IN_STOCK)?.offerId,
      'offer-a',
    );
  });

  it('L16/L20: only a per-item offer without a spend or quantity minimum gives gifts', () => {
    const run = (overrides) => giftOfferForProduct(BAG_3000, null, [bagOffer(overrides)], CTX, ALL_IN_STOCK);
    assert.ok(run({ scope: 'item' }));
    assert.ok(run({ scope: 'item', minimum: null }));
    assert.ok(run({ minimum: { subtotal: 0, quantity: 0 } }));
    assert.equal(run({ scope: 'cart' }), null);
    assert.equal(run({ minimum: { subtotal: 3000 } }), null);
    assert.equal(run({ minimum: { quantity: 2 } }), null);
  });

  it('a gift never changes the price of the product', () => {
    const priced = priceItem(BAG_3000, null, [bagOffer()], CTX);
    assert.equal(priced.effectivePrice, 3000);
    assert.equal(priced.appliedOfferId, null);
    assert.equal(displayPrice(BAG_3000, [bagOffer()], CTX).fromPrice, 3000);
  });

  it('gifts only for the right audience, schedule and status', () => {
    const run = (overrides, ctx = VISITOR) =>
      giftOfferForProduct(BAG_3000, null, [bagOffer(overrides)], ctx, ALL_IN_STOCK)?.offerId ?? null;
    assert.equal(run({}), 'offer-bag');
    assert.equal(run({ active: false }), null);
    assert.equal(run({ archived: true }), null);
    assert.equal(run({ audience: 'signedIn' }), null);
    assert.equal(run({ audience: 'signedIn' }, CTX), 'offer-bag');
    const schedule = (startsAt, endsAt) => ({ schedule: { startsAt, endsAt, timezone: 'Africa/Cairo' } });
    const gift = (startsAt, endsAt) => {
      const offer = { ...bagOffer(), ...schedule(startsAt, endsAt) };
      return giftOfferForProduct(BAG_3000, null, [offer], CTX, ALL_IN_STOCK)?.offerId ?? null;
    };
    assert.equal(gift(NOW, null), 'offer-bag');
    assert.equal(gift(null, NOW), null);
    assert.equal(gift(new Date(NOW.getTime() + 1), null), null);
    assert.equal(gift(null, new Date(NOW.getTime() + 1)), 'offer-bag');
  });

  it('a product outside the include rules, or in the exclude rules, gets no gifts', () => {
    const tee = product('tee-9', TEES, 500);
    assert.equal(giftOfferForProduct(tee, null, [bagOffer()], CTX, ALL_IN_STOCK), null);
    const excluding = bagOffer({ exclude: ids('productId', ['bag-3000']) });
    assert.equal(giftOfferForProduct(BAG_3000, null, [excluding], CTX, ALL_IN_STOCK), null);
    assert.ok(giftOfferForProduct(BAG_400, null, [excluding], CTX, ALL_IN_STOCK));
    const everything = bagOffer({ conditions: EVERYTHING });
    assert.ok(giftOfferForProduct(tee, null, [everything], CTX, ALL_IN_STOCK));
  });

  it('a colour variant outside the offer gets no gifts, a product with no variant chosen does', () => {
    const bag = product('bag-two-colours', ['bags'], 3000, { colors: ['black', 'white'] });
    const blackOnly = bagOffer({ conditions: { anyOf: [{ allOf: [{ field: 'colors', in: ['black'] }] }] } });
    const lookup = (variant) =>
      giftOfferForProduct(bag, variant, [blackOnly], CTX, ALL_IN_STOCK)?.offerId ?? null;
    assert.equal(lookup(null), 'offer-bag');
    assert.equal(lookup({ id: 'b', color: 'black' }), 'offer-bag');
    assert.equal(lookup({ id: 'w', color: 'white' }), null);
    assert.equal(
      giftOfferById('offer-bag', bag, { id: 'w', color: 'white' }, [blackOnly], CTX, ALL_IN_STOCK),
      null,
    );
  });
});

describe('I8: Free gift and "Skip products already on sale"', () => {
  const BAG_ON_SALE = product('bag-sale', ['bags'], 2500, { compareAtPrice: 3000 });
  const skip = giftOffer('skip', [SHIRT_GIFT], { saleItems: 'exclude' });

  it('a product on sale gets no Gift Box from an offer that skips sale items; a full-price one does', () => {
    assert.equal(giftOfferForProduct(BAG_ON_SALE, null, [skip], CTX, ALL_IN_STOCK), null);
    assert.equal(giftOfferById('skip', BAG_ON_SALE, null, [skip], CTX, ALL_IN_STOCK), null);
    assert.equal(giftOfferForProduct(BAG_3000, null, [skip], CTX, ALL_IN_STOCK)?.offerId, 'skip');
  });

  it('"Best discount wins" gives gifts to a product on sale', () => {
    const bestOf = giftOffer('best', [SHIRT_GIFT], { saleItems: 'bestOf' });
    assert.equal(giftOfferForProduct(BAG_ON_SALE, null, [bestOf], CTX, ALL_IN_STOCK)?.offerId, 'best');
  });

  it('an old price equal to or below the price is not a sale', () => {
    const same = product('bag-same', ['bags'], 2500, { compareAtPrice: 2500 });
    const lower = product('bag-lower', ['bags'], 2500, { compareAtPrice: 2000 });
    assert.equal(giftOfferForProduct(same, null, [skip], CTX, ALL_IN_STOCK)?.offerId, 'skip');
    assert.equal(giftOfferForProduct(lower, null, [skip], CTX, ALL_IN_STOCK)?.offerId, 'skip');
  });

  it('the next gift offer applies when the first skips a product on sale', () => {
    const other = giftOffer('other', [SOCKS_GIFT], { priority: -5 });
    const first = { ...skip, priority: 10 };
    assert.equal(giftOfferForProduct(BAG_ON_SALE, null, [first, other], CTX, ALL_IN_STOCK)?.offerId, 'other');
    assert.equal(giftOfferForProduct(BAG_3000, null, [first, other], CTX, ALL_IN_STOCK)?.offerId, 'skip');
  });
});

describe('L: checking the shopper picks', () => {
  const offer = () =>
    giftOfferById(
      'offer-bag',
      BAG_3000,
      null,
      [giftOffer('offer-bag', [SHIRT_GIFT, SOCKS_GIFT])],
      CTX,
      ALL_IN_STOCK,
    );

  it('accepts picks and returns them in the offer order', () => {
    const check = checkGiftPicks(offer(), [
      { giftId: 'socks', productId: 'socks-1' },
      { giftId: 'shirt', productId: 'tee-2' },
    ]);
    assert.equal(check.ok, true);
    assert.deepEqual(check.ok ? check.picks.map((pick) => [pick.gift.id, pick.productId]) : [], [
      ['shirt', 'tee-2'],
      ['socks', 'socks-1'],
    ]);
  });

  it('a gift the shopper did not pick is simply not given', () => {
    const check = checkGiftPicks(offer(), [{ giftId: 'shirt', productId: 'tee-1' }]);
    assert.equal(check.ok, true);
    assert.deepEqual(check.ok ? check.picks.map((pick) => pick.gift.id) : [], ['shirt']);
    const none = checkGiftPicks(offer(), []);
    assert.deepEqual(none, { ok: true, picks: [] });
  });

  it('refuses a product that belongs to another gift, an unknown gift and a repeated gift', () => {
    assert.deepEqual(checkGiftPicks(offer(), [{ giftId: 'shirt', productId: 'socks-1' }]), {
      ok: false,
      problem: 'choice-not-allowed',
    });
    assert.deepEqual(checkGiftPicks(offer(), [{ giftId: 'hat', productId: 'tee-1' }]), {
      ok: false,
      problem: 'unknown-gift',
    });
    assert.deepEqual(
      checkGiftPicks(offer(), [
        { giftId: 'shirt', productId: 'tee-1' },
        { giftId: 'shirt', productId: 'tee-2' },
      ]),
      { ok: false, problem: 'duplicate-gift' },
    );
  });

  it('refuses a choice that sold out, now that the offer only lists what can be given', () => {
    const soldOutTee = ALL_IN_STOCK.map((choice) =>
      choice.productId === 'tee-1' ? { ...choice, inStock: false } : choice,
    );
    const current = giftOfferById(
      'offer-bag',
      BAG_3000,
      null,
      [giftOffer('offer-bag', [SHIRT_GIFT, SOCKS_GIFT])],
      CTX,
      soldOutTee,
    );
    assert.deepEqual(checkGiftPicks(current, [{ giftId: 'shirt', productId: 'tee-1' }]), {
      ok: false,
      problem: 'choice-not-allowed',
    });
    assert.equal(checkGiftPicks(current, [{ giftId: 'shirt', productId: 'tee-2' }]).ok, true);
  });

  it('giftOfferById is null for another id, a paused offer or a product outside the offer', () => {
    const offers = [giftOffer('offer-bag', [SHIRT_GIFT])];
    assert.equal(giftOfferById('nope', BAG_3000, null, offers, CTX, ALL_IN_STOCK), null);
    assert.equal(
      giftOfferById('offer-bag', BAG_3000, null, [{ ...offers[0], active: false }], CTX, ALL_IN_STOCK),
      null,
    );
    assert.equal(
      giftOfferById('offer-bag', product('tee-x', TEES, 500), null, offers, CTX, ALL_IN_STOCK),
      null,
    );
  });

  it('giftChoiceIds lists each gift product once and ignores offers that are not Free gift', () => {
    const offers = [
      giftOffer('a', [SHIRT_GIFT, SOCKS_GIFT]),
      giftOffer('b', [{ id: 'shirt', name: 'Free shirt', productIds: ['tee-2', 'tee-3'] }]),
      bxgy('deal'),
    ];
    assert.deepEqual([...giftChoiceIds(offers)].sort(), ['socks-1', 'tee-1', 'tee-2', 'tee-3']);
    assert.deepEqual(giftChoiceIds([]), []);
  });
});

describe('L13-L15: Free gift validation on save', () => {
  // The offer reader repairs bad gifts (empty name becomes "Free gift"), so the draft skips it.
  const draftWith = (gifts, overrides = {}) => ({
    ...giftOffer('draft', [SHIRT_GIFT], overrides),
    reward: { kind: 'freeGift', gifts },
  });
  const errors = (offer, products = []) =>
    validateOffer(offer, products, [], CTX).errors.map((error) => [error.code, error.message]);

  it('L13: a gift with no products cannot be saved', () => {
    assert.deepEqual(errors(draftWith([{ id: 'shirt', name: 'Free shirt', productIds: [] }])), [
      ['reward.giftChoices', 'Choose at least one product shoppers can pick for "Free shirt".'],
    ]);
  });

  it('an offer with no gifts cannot be saved', () => {
    assert.deepEqual(errors(draftWith([])), [['reward.gifts', 'Add at least one gift.']]);
  });

  it('L14: a gift needs a name of 1 to 40 characters', () => {
    const message = 'Give each gift a short name between 1 and 40 characters, e.g. "Free shirt".';
    assert.deepEqual(errors(draftWith([{ id: 'g', name: '  ', productIds: ['tee-1'] }])), [
      ['reward.giftName', message],
    ]);
    assert.deepEqual(errors(draftWith([{ id: 'g', name: 'x'.repeat(41), productIds: ['tee-1'] }])), [
      ['reward.giftName', message],
    ]);
    assert.deepEqual(errors(draftWith([{ id: 'g', name: 'x'.repeat(40), productIds: ['tee-1'] }])), []);
  });

  it('L15: at most 5 gifts and 20 choices per gift', () => {
    const gift = (index, count = 1) => ({
      id: `g${index}`,
      name: `Gift ${index}`,
      productIds: Array.from({ length: count }, (_, n) => `p${index}-${n}`),
    });
    // The offer reader keeps at most 5 gifts, so a sixth never reaches validation as a saved offer.
    const six = {
      ...draftWith([gift(1)]),
      reward: { kind: 'freeGift', gifts: [1, 2, 3, 4, 5, 6].map((n) => gift(n)) },
    };
    assert.deepEqual(
      errors(six).map(([code]) => code),
      ['reward.giftsCount'],
    );
    const five = {
      ...draftWith([gift(1)]),
      reward: { kind: 'freeGift', gifts: [1, 2, 3, 4, 5].map((n) => gift(n)) },
    };
    assert.deepEqual(errors(five), []);
    const twentyOne = { ...draftWith([gift(1)]), reward: { kind: 'freeGift', gifts: [gift(1, 21)] } };
    assert.deepEqual(
      errors(twentyOne).map(([code]) => code),
      ['reward.giftChoicesCount'],
    );
    const twenty = { ...draftWith([gift(1)]), reward: { kind: 'freeGift', gifts: [gift(1, 20)] } };
    assert.deepEqual(errors(twenty), []);
  });

  it('two gifts with the same id are refused', () => {
    const duplicate = {
      ...draftWith([SHIRT_GIFT]),
      reward: { kind: 'freeGift', gifts: [SHIRT_GIFT, { ...SOCKS_GIFT, id: 'shirt' }] },
    };
    assert.deepEqual(
      errors(duplicate).map(([code]) => code),
      ['reward.giftId'],
    );
  });

  it('a gift product missing from the catalogue is refused when the catalogue is known', () => {
    const known = [product('tee-1', TEES, 500), product('tee-2', TEES, 500)];
    assert.deepEqual(
      errors(draftWith([SHIRT_GIFT]), known).map(([code]) => code),
      [],
    );
    assert.deepEqual(
      errors(draftWith([{ id: 'g', name: 'Free shirt', productIds: ['tee-1', 'gone'] }]), known).map(
        ([code]) => code,
      ),
      ['reward.giftMissing'],
    );
  });
});
