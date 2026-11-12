import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import {
  bundleSetOffersForItem,
  bundleSetShares,
  bundleSetSlotFits,
  bundleSetTotal,
  dealTag,
  displayPrice,
  priceBagDeals,
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

const TEE = product('tee', ['apparel', 't-shirts'], 500);
const TEE_2 = product('tee-2', ['apparel', 't-shirts'], 400);
const SHORTS = product('shorts', ['apparel', 'shorts'], 300);
const SOCKS = product('socks', ['apparel', 'socks'], 175);

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

const category = (id) => ({ anyOf: [{ allOf: [{ field: 'categoryIds', in: [id] }] }] });

const TEE_SLOT = { id: 'slot-1', name: 'T-shirt', quantity: 1, conditions: category('t-shirts') };
const SHORTS_SLOT = { id: 'slot-2', name: 'Shorts', quantity: 1, conditions: category('shorts') };

function reward(setReward, extra = {}) {
  return { kind: 'bundleSet', slots: [TEE_SLOT, SHORTS_SLOT], setReward, maxSets: null, ...extra };
}

function offer(id, rewardValue, overrides = {}) {
  return parseOfferDoc(id, {
    name: id,
    title: overrides.title ?? id,
    active: true,
    scope: 'item',
    conditions: { anyOf: [] },
    reward: rewardValue,
    ...overrides,
  });
}

const SET_600 = offer('set-600', reward({ type: 'total', price: 600 }), { title: 'Tee and shorts' });

function bagTotal(deals) {
  return deals.lines.reduce((sum, entry) => sum + entry.total, 0);
}

describe('Bundle & Save: the four savings', () => {
  it('a set price: the set costs what staff typed, split by the pieces own prices', () => {
    const deals = priceBagDeals([line(TEE), line(SHORTS)], [SET_600], CTX);
    assert.equal(bagTotal(deals), 600);
    assert.deepEqual(
      deals.lines.map((entry) => entry.total),
      [375, 225],
    );
    assert.deepEqual(deals.lines[0].deals, [
      { offerId: 'set-600', units: 1, percent: 0, discount: 125, bundle: true, set: true },
    ]);
    assert.deepEqual(deals.offerIds, ['set-600']);
    assert.equal(deals.sets.length, 1);
    const set = deals.sets[0];
    assert.equal(set.sets, 1);
    assert.equal(set.units, 2);
    assert.equal(set.total, 600);
    assert.equal(set.saving, 200);
    assert.equal(set.lineIndex, 1);
    assert.deepEqual(set.missing, []);
    assert.equal(dealTag(deals.lines[0].deals, 1), 'Bundle & Save');
  });

  it('a percent off the set', () => {
    const percent = offer('p20', reward({ type: 'percent', percent: 20 }));
    const deals = priceBagDeals([line(TEE), line(SHORTS)], [percent], CTX);
    assert.equal(bagTotal(deals), 640);
    assert.deepEqual(
      deals.lines.map((entry) => entry.total),
      [400, 240],
    );
  });

  it('an amount off the set', () => {
    const amount = offer('a100', reward({ type: 'amount', amount: 100 }));
    const deals = priceBagDeals([line(TEE), line(SHORTS)], [amount], CTX);
    assert.equal(bagTotal(deals), 700);
    assert.equal(deals.sets[0].saving, 100);
  });

  it('the cheapest piece free: that piece pays 0, the others their own price', () => {
    const free = offer('free', reward({ type: 'cheapestFree' }));
    const deals = priceBagDeals([line(TEE), line(SHORTS)], [free], CTX);
    assert.equal(bagTotal(deals), 500);
    assert.deepEqual(
      deals.lines.map((entry) => entry.total),
      [500, 0],
    );
    assert.equal(deals.lines[0].deals.length, 1);
    assert.equal(deals.lines[0].deals[0].discount, 0);
    assert.equal(deals.lines[1].deals[0].discount, 300);
  });

  it('shares always add up to the set total in whole EGP', () => {
    assert.deepEqual(bundleSetShares({ type: 'total', price: 275 }, [175, 175, 175]), [92, 92, 91]);
    assert.deepEqual(bundleSetShares({ type: 'cheapestFree' }, [300, 200, 200]), [300, 200, 0]);
    assert.equal(bundleSetTotal({ type: 'percent', percent: 15 }, [333, 333]), 566);
  });
});

describe('Bundle & Save: how many sets', () => {
  it('repeats: 2 and 3 full sets each get the saving', () => {
    const two = priceBagDeals([line(TEE, 2), line(SHORTS, 2)], [SET_600], CTX);
    assert.equal(two.sets[0].sets, 2);
    assert.equal(bagTotal(two), 1200);
    const three = priceBagDeals([line(TEE, 3), line(SHORTS, 3)], [SET_600], CTX);
    assert.equal(three.sets[0].sets, 3);
    assert.equal(bagTotal(three), 1800);
    assert.equal(three.lines[0].deals[0].units, 3);
  });

  it('stops at "at most" sets; the rest pay their own price and there is no nudge', () => {
    const capped = offer('capped', reward({ type: 'total', price: 600 }, { maxSets: 2 }));
    const deals = priceBagDeals([line(TEE, 3), line(SHORTS, 3)], [capped], CTX);
    assert.equal(deals.sets[0].sets, 2);
    assert.equal(bagTotal(deals), 1200 + 500 + 300);
    assert.deepEqual(deals.sets[0].missing, []);
  });

  it('a piece that fits two groups goes where it lets every set be complete', () => {
    // Group 1: T-shirts only. Group 2: any apparel. Two tees and two shorts make two sets only
    // when both tees go to group 1.
    const either = offer('either', {
      kind: 'bundleSet',
      slots: [TEE_SLOT, { id: 'slot-2', name: 'Anything', quantity: 1, conditions: category('apparel') }],
      setReward: { type: 'percent', percent: 10 },
      maxSets: null,
    });
    const deals = priceBagDeals([line(TEE), line(TEE_2), line(SHORTS, 2)], [either], CTX);
    assert.equal(deals.sets[0].sets, 2);
    assert.equal(deals.lines[2].deals[0].units, 2);
  });

  it('uses the most expensive pieces when there are more than one set needs', () => {
    const either = offer('either', {
      kind: 'bundleSet',
      slots: [TEE_SLOT, { id: 'slot-2', name: 'Anything', quantity: 1, conditions: category('apparel') }],
      setReward: { type: 'percent', percent: 10 },
      maxSets: null,
    });
    const deals = priceBagDeals([line(TEE), line(TEE_2), line(SHORTS)], [either], CTX);
    assert.equal(deals.sets[0].sets, 1);
    assert.equal(deals.sets[0].saving, 90);
    assert.equal(deals.lines[2].deals.length, 0);
    assert.deepEqual(deals.sets[0].missing, [{ slotId: 'slot-1', name: 'T-shirt', quantity: 1 }]);
  });

  it('a group with 2 pieces needs both', () => {
    const twoTees = offer('two-tees', {
      kind: 'bundleSet',
      slots: [{ ...TEE_SLOT, quantity: 2 }, SHORTS_SLOT],
      setReward: { type: 'total', price: 1000 },
      maxSets: null,
    });
    const one = priceBagDeals([line(TEE), line(SHORTS)], [twoTees], CTX);
    assert.equal(one.sets[0].sets, 0);
    assert.deepEqual(one.sets[0].missing, [{ slotId: 'slot-1', name: 'T-shirt', quantity: 1 }]);
    const full = priceBagDeals([line(TEE, 2), line(SHORTS)], [twoTees], CTX);
    assert.equal(bagTotal(full), 1000);
  });
});

describe('Bundle & Save: an incomplete set', () => {
  it('gives no discount and says which group is still empty', () => {
    const deals = priceBagDeals([line(TEE)], [SET_600], CTX);
    assert.equal(bagTotal(deals), 500);
    assert.deepEqual(deals.offerIds, []);
    assert.equal(deals.sets[0].sets, 0);
    assert.equal(deals.sets[0].lineIndex, 0);
    assert.deepEqual(deals.sets[0].missing, [{ slotId: 'slot-2', name: 'Shorts', quantity: 1 }]);
  });

  it('has no nudge for a bag of exactly whole sets', () => {
    assert.deepEqual(priceBagDeals([line(TEE), line(SHORTS)], [SET_600], CTX).sets[0].missing, []);
  });

  it('says nothing when no piece in the bag fits a group', () => {
    const deals = priceBagDeals([line(SOCKS)], [SET_600], CTX);
    assert.deepEqual(deals.sets, []);
  });

  it('leaves out sale items when the offer skips them', () => {
    const skip = offer('skip', reward({ type: 'total', price: 600 }), { saleItems: 'exclude' });
    const deals = priceBagDeals([line(TEE), line(SHORTS, 1, { onSale: true })], [skip], CTX);
    assert.equal(bagTotal(deals), 800);
    assert.deepEqual(deals.sets[0].missing, [{ slotId: 'slot-2', name: 'Shorts', quantity: 1 }]);
  });

  it('leaves out excluded products', () => {
    const exclude = { anyOf: [{ allOf: [{ field: 'productId', in: ['shorts'] }] }] };
    const skip = offer('skip', reward({ type: 'total', price: 600 }), { exclude });
    assert.equal(bagTotal(priceBagDeals([line(TEE), line(SHORTS)], [skip], CTX)), 800);
  });
});

describe('Bundle & Save: one discount per item', () => {
  it('per-item offers win when they make the pieces cheaper; a tie keeps them', () => {
    const lines = [line(TEE, 1, { offerPrice: 350 }), line(SHORTS, 1, { offerPrice: 210 })];
    const deals = priceBagDeals(lines, [SET_600], CTX);
    assert.equal(bagTotal(deals), 560);
    assert.deepEqual(deals.offerIds, []);
    assert.deepEqual(deals.sets[0].missing, []);
    const tie = offer('tie', reward({ type: 'total', price: 560 }));
    assert.deepEqual(priceBagDeals(lines, [tie], CTX).offerIds, []);
    const cheaper = offer('cheaper', reward({ type: 'total', price: 550 }));
    assert.equal(bagTotal(priceBagDeals(lines, [cheaper], CTX)), 550);
  });

  it('fills a set with the pieces that cost most after per-item offers, so a cheaper set can still win', () => {
    const twenty = offer('twenty', reward({ type: 'percent', percent: 20 }));
    const a1 = product('a1', ['apparel', 't-shirts'], 1000);
    const a2 = product('a2', ['apparel', 't-shirts'], 800);
    const b1 = product('b1', ['apparel', 'shorts'], 500);
    const lines = [line(a1, 1, { offerPrice: 500 }), line(a2), line(b1)];
    const deals = priceBagDeals(lines, [twenty], CTX);
    assert.equal(deals.sets[0].sets, 1);
    assert.equal(bagTotal(deals), 500 + 1040);
    assert.equal(deals.lines[0].deals.length, 0);
  });

  it('a set that loses does not use up "at most" sets', () => {
    const one = offer('one', reward({ type: 'percent', percent: 20 }, { maxSets: 1 }));
    const a1 = product('a1', ['apparel', 't-shirts'], 1000);
    const a2 = product('a2', ['apparel', 't-shirts'], 600);
    const b1 = product('b1', ['apparel', 'shorts'], 500);
    const b2 = product('b2', ['apparel', 'shorts'], 300);
    // The first set (a1 + b1 at 1200) loses to their own prices (700 + 350); a1 is left out and
    // a2 + b1 (880 against 950) gets the saving.
    const lines = [line(a1, 1, { offerPrice: 700 }), line(a2), line(b1, 1, { offerPrice: 350 }), line(b2)];
    const deals = priceBagDeals(lines, [one], CTX);
    assert.equal(deals.sets[0].sets, 1);
    assert.equal(bagTotal(deals), 700 + 880 + 300);
    assert.equal(deals.lines[0].deals.length, 0);
  });

  it('with Buy X Get Y on the same pieces the cheapest bag wins, never both', () => {
    const b1g1 = offer(
      'b1g1',
      {
        kind: 'buyXGetY',
        buy: { quantity: 1 },
        get: { quantity: 1, percent: 100 },
        getConditions: null,
        repeat: true,
      },
      { conditions: category('apparel'), priority: 10 },
    );
    const lines = [line(TEE), line(SHORTS)];
    const dealWins = priceBagDeals(lines, [SET_600, b1g1], CTX);
    assert.equal(bagTotal(dealWins), 500);
    assert.deepEqual(dealWins.offerIds, ['b1g1']);
    const set450 = offer('set-450', reward({ type: 'total', price: 450 }));
    const setWins = priceBagDeals(lines, [set450, b1g1], CTX);
    assert.equal(bagTotal(setWins), 450);
    assert.deepEqual(setWins.offerIds, ['set-450']);
    assert.ok(setWins.lines.every((entry) => entry.deals.length === 1));
  });

  it('with Bundle price on the same pieces the cheapest bag wins, never both', () => {
    const pair = offer(
      'pair',
      { kind: 'bundlePrice', rows: [{ quantity: 2, price: 700 }] },
      {
        conditions: category('apparel'),
        priority: 10,
      },
    );
    const lines = [line(TEE), line(SHORTS)];
    assert.equal(bagTotal(priceBagDeals(lines, [SET_600, pair], CTX)), 600);
    const set750 = offer('set-750', reward({ type: 'total', price: 750 }));
    const bundleWins = priceBagDeals(lines, [set750, pair], CTX);
    assert.equal(bagTotal(bundleWins), 700);
    assert.deepEqual(bundleWins.offerIds, ['pair']);
  });

  it('each piece counts toward one Bundle & Save offer, the higher-priority one first', () => {
    const high = offer('high', reward({ type: 'total', price: 700 }), { priority: 10 });
    const low = offer('low', reward({ type: 'total', price: 600 }), { priority: 1 });
    const deals = priceBagDeals([line(TEE), line(SHORTS)], [low, high], CTX);
    assert.deepEqual(deals.offerIds, ['high']);
    assert.equal(bagTotal(deals), 700);
  });

  it('pieces in a set keep their free gifts', () => {
    const deals = priceBagDeals([line(TEE, 1, { giftWorth: 100 }), line(SHORTS)], [SET_600], CTX);
    assert.equal(deals.lines[0].giftUnits, 1);
    assert.equal(deals.lines[0].discountedUnits, 0);
  });
});

describe('Bundle & Save: cards and Shop', () => {
  const priced = (facts) => ({ ...facts, name: facts.productId, compareAtPrice: null });

  it('lists the offer for every product in a group, keeps the card price', () => {
    const tee = displayPrice(priced(TEE), [SET_600], CTX);
    assert.deepEqual(tee.offerIds, ['set-600']);
    assert.equal(tee.fromPrice, 500);
    assert.equal(tee.maxDiscountPercent, 0);
    assert.deepEqual(displayPrice(priced(SHORTS), [SET_600], CTX).offerIds, ['set-600']);
    assert.deepEqual(displayPrice(priced(SOCKS), [SET_600], CTX).offerIds, []);
  });
});

describe('Bundle & Save: checks and reading', () => {
  const draft = (rewardValue) => ({ ...SET_600, id: undefined, reward: rewardValue });
  const codes = (rewardValue) =>
    validateOffer(draft(rewardValue), [], [], CTX).errors.map((issue) => issue.code);

  it('accepts a good offer', () => {
    assert.deepEqual(codes(reward({ type: 'total', price: 600 })), []);
    assert.deepEqual(codes(reward({ type: 'cheapestFree' }, { maxSets: 3 })), []);
  });

  it('refuses bad groups and savings', () => {
    assert.ok(
      codes(reward({ type: 'total', price: 600 }, { slots: [TEE_SLOT] })).includes('reward.bundleSlots'),
    );
    const five = [1, 2, 3, 4, 5].map((n) => ({ ...TEE_SLOT, id: `slot-${n}` }));
    assert.ok(codes(reward({ type: 'total', price: 600 }, { slots: five })).includes('reward.bundleSlots'));
    assert.ok(
      codes(
        reward({ type: 'total', price: 600 }, { slots: [{ ...TEE_SLOT, quantity: 6 }, SHORTS_SLOT] }),
      ).includes('reward.bundleSlotPieces'),
    );
    assert.ok(
      codes(
        reward({ type: 'total', price: 600 }, { slots: [{ ...TEE_SLOT, quantity: 0 }, SHORTS_SLOT] }),
      ).includes('reward.bundleSlotPieces'),
    );
    assert.ok(
      codes(
        reward(
          { type: 'total', price: 600 },
          { slots: [{ ...TEE_SLOT, conditions: { anyOf: [] } }, SHORTS_SLOT] },
        ),
      ).includes('reward.bundleSlotProducts'),
    );
    assert.ok(
      codes(
        reward({ type: 'total', price: 600 }, { slots: [{ ...TEE_SLOT, name: '  ' }, SHORTS_SLOT] }),
      ).includes('reward.bundleSlotName'),
    );
    assert.ok(codes(reward({ type: 'percent', percent: 0 })).includes('reward.bundleSetPercent'));
    assert.ok(codes(reward({ type: 'percent', percent: 91 })).includes('reward.bundleSetPercent'));
    assert.ok(codes(reward({ type: 'amount', amount: 0 })).includes('reward.bundleSetAmount'));
    assert.ok(codes(reward({ type: 'amount', amount: 99.5 })).includes('reward.bundleSetAmount'));
    assert.ok(codes(reward({ type: 'total', price: 0 })).includes('reward.bundleSetPrice'));
    assert.ok(codes(reward({ type: 'total', price: 600 }, { maxSets: 0 })).includes('reward.bundleMaxSets'));
  });

  it('a saved offer with a bad reward is kept but prices nothing and covers no product', () => {
    const bad = offer('bad', reward({ type: 'percent', percent: 95 }));
    assert.ok(bad);
    assert.equal(bad.reward.kind, 'bundleSet');
    assert.deepEqual(bad.reward.slots, []);
    assert.equal(bagTotal(priceBagDeals([line(TEE), line(SHORTS)], [bad], CTX)), 800);
    assert.deepEqual(displayPrice({ ...TEE, name: 'tee', compareAtPrice: null }, [bad], CTX).offerIds, []);
  });

  it('reads a saved offer as written; a missing "at most" means no limit', () => {
    const parsed = offer('read', {
      kind: 'bundleSet',
      slots: [TEE_SLOT, SHORTS_SLOT],
      setReward: { type: 'amount', amount: 100 },
    });
    assert.equal(parsed.reward.maxSets, null);
    assert.equal(parsed.reward.slots.length, 2);
    assert.deepEqual(parsed.reward.setReward, { type: 'amount', amount: 100 });
  });

  it('trims group ids and names, so a repeated id with a space is still refused', () => {
    const spaced = offer(
      'spaced',
      reward(
        { type: 'total', price: 600 },
        {
          slots: [
            { ...TEE_SLOT, id: 'a', name: ' T-shirt ' },
            { ...SHORTS_SLOT, id: 'a ' },
          ],
        },
      ),
    );
    assert.deepEqual(spaced.reward.slots, []);
    const named = offer(
      'named',
      reward({ type: 'total', price: 600 }, { slots: [{ ...TEE_SLOT, name: ' T-shirt ' }, SHORTS_SLOT] }),
    );
    assert.equal(named.reward.slots[0].name, 'T-shirt');
  });

  it('refuses a group with more than 200 values', () => {
    const many = Array.from({ length: 201 }, (_, n) => `p${n}`);
    const big = { ...TEE_SLOT, conditions: { anyOf: [{ allOf: [{ field: 'productId', in: many }] }] } };
    assert.ok(
      codes(reward({ type: 'total', price: 600 }, { slots: [big, SHORTS_SLOT] })).includes(
        'reward.bundleSlotRules',
      ),
    );
  });

  it('warns about overlaps in plain words', () => {
    const products = [{ ...TEE, name: 'Tee', compareAtPrice: null }];
    const warn = (other) =>
      validateOffer(draft(reward({ type: 'total', price: 600 })), products, [other], CTX).warnings.find(
        (issue) => issue.code === `overlap.${other.id}`,
      )?.message;
    const all = { conditions: category('apparel') };
    assert.match(
      warn(offer('sale', { kind: 'percentOff', percent: 10 }, all)),
      /whichever saves them more, never both/,
    );
    assert.match(
      warn(
        offer('b1g1', { kind: 'buyXGetY', buy: { quantity: 1 }, get: { quantity: 1, percent: 100 } }, all),
      ),
      /whichever saves them more, never both/,
    );
    assert.match(
      warn(offer('pair', { kind: 'bundlePrice', rows: [{ quantity: 2, price: 700 }] }, all)),
      /whichever saves them more, never both/,
    );
    assert.match(
      warn(offer('other-set', reward({ type: 'cheapestFree' }))),
      /Each item counts toward one Bundle & Save offer only, the higher-priority one first\./,
    );
    assert.match(
      warn(
        offer(
          'gift',
          { kind: 'freeGift', gifts: [{ id: 'g', name: 'Free socks', productIds: ['socks'] }] },
          all,
        ),
      ),
      /Shoppers get both: the discount and the free gift\./,
    );
  });

  it('tags a mixed line', () => {
    assert.equal(
      dealTag(
        [
          { units: 1, percent: 0, bundle: true, set: true },
          { units: 1, percent: 100 },
        ],
        2,
      ),
      'Bundle & Save · 1 free',
    );
  });
});

describe('Bundle & Save: the product page offer (bundleSetOffersForItem)', () => {
  const item = (facts, onSale = false) => ({ product: facts, variant: null, onSale });

  it('lists the offers an item fits a group of, highest priority first', () => {
    const low = offer('low', reward({ type: 'percent', percent: 10 }), { priority: 1 });
    const high = offer('high', reward({ type: 'percent', percent: 20 }), { priority: 5 });
    const ids = bundleSetOffersForItem([low, high], CTX, item(TEE)).map((entry) => entry.id);
    assert.deepEqual(ids, ['high', 'low']);
  });

  it('leaves out an item no group takes, a sale item when sale items are left out, and a paused offer', () => {
    assert.deepEqual(bundleSetOffersForItem([SET_600], CTX, item(SOCKS)), []);
    const noSale = offer('no-sale', reward({ type: 'percent', percent: 10 }), { saleItems: 'exclude' });
    assert.deepEqual(bundleSetOffersForItem([noSale], CTX, item(TEE, true)), []);
    const paused = offer('paused', reward({ type: 'percent', percent: 10 }), { active: false });
    assert.deepEqual(bundleSetOffersForItem([paused], CTX, item(TEE)), []);
  });

  it('tells which group an item fills', () => {
    assert.equal(bundleSetSlotFits(SET_600, TEE_SLOT, item(TEE)), true);
    assert.equal(bundleSetSlotFits(SET_600, SHORTS_SLOT, item(TEE)), false);
    assert.equal(bundleSetSlotFits(SET_600, SHORTS_SLOT, item(SHORTS)), true);
  });
});
