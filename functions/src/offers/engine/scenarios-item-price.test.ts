import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled code (lib is built from the current sources); engine files import `./x.js`.
import {
  cairoWallTimeToDate,
  dateToCairoWallTime,
  describeOfferReward,
  displayPrice,
  formatAppliedOfferBadge,
  formatCairoDate,
  formatCairoDateTimeInput,
  formatCairoDisplay,
  formatLabelOnlyOfferBadge,
  liveOffers,
  matchProduct,
  matchVariant,
  parseCairoDateTimeInput,
  partialColorSummary,
  priceItem,
  toDisplayAmount,
  validateOffer,
} from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';
import { computeProductOfferFields, toSearchRecord } from '../../../lib/search/product-record.js';

/**
 * Scenario tests for per-item pricing and admin validation (test plan docs/qa/offers-test-scenarios.md,
 * rules decided Nov 10, 2026). Test names start with the plan row they cover (A2, E8, O1, ...).
 *
 * Money: whole EGP. P1 costs 1,000; P2 is on sale (800, was 1,000); P3 costs 200.
 */

type Obj = Record<string, any>;

const NOW = new Date('2026-11-10T12:00:00Z');
const MIN = 60_000;
const HOUR = 3_600_000;
const VISITOR = { now: NOW, signedIn: false, codes: [] };
const SHOPPER = { now: NOW, signedIn: true, codes: [] };

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

function product(over: Obj = {}): Obj {
  return {
    productId: 'p1',
    name: 'P1',
    brandId: 'brand-a',
    categoryIds: ['apparel', 't-shirts'],
    type: 'tshirt',
    modelGroup: null,
    colors: [],
    sizes: [],
    tags: [],
    price: 1000,
    compareAtPrice: null,
    ...over,
  };
}

const P1 = product();
const P2 = product({ productId: 'p2', name: 'P2', price: 800, compareAtPrice: 1000 });
const P3 = product({ productId: 'p3', name: 'P3', price: 200 });
const P4 = product({
  productId: 'p4',
  name: 'P4',
  brandId: 'brand-b',
  categoryIds: ['padel', 'balls'],
  type: 'ball',
  price: 150,
});

const pct = (percent: number): Obj => ({ kind: 'percentOff', percent });
const amt = (amount: number): Obj => ({ kind: 'amountOff', amount });
const fixed = (price: number): Obj => ({ kind: 'fixedPrice', price });
const BXGY: Obj = {
  kind: 'buyXGetY',
  buy: { quantity: 2 },
  get: { quantity: 1, percent: 100 },
  getConditions: null,
  cheapestFree: true,
  repeat: true,
  maxApplications: null,
};
const GIFT: Obj = {
  kind: 'freeGift',
  gifts: [{ id: 'gift-1', name: 'Free shirt', productIds: ['p3'] }],
};
const SHIP: Obj = { kind: 'freeShipping' };

/** A live offer for everyone on every product; override anything. Default sale policy: Best discount wins. */
function mk(id: string, reward: Obj, over: Obj = {}): Obj {
  return {
    id,
    name: id,
    title: id,
    badge: null,
    description: null,
    active: true,
    archived: false,
    visibility: 'public',
    audience: 'everyone',
    schedule: { startsAt: null, endsAt: null, timezone: 'Africa/Cairo' },
    priority: 0,
    stacking: 'stackable',
    saleItems: 'bestOf',
    scope: 'item',
    conditions: { anyOf: [] },
    exclude: { anyOf: [] },
    minimum: null,
    reward,
    limits: { totalUses: null, perCustomer: null },
    requiresCode: false,
    code: null,
    updatedAtMs: 0,
    ...over,
  };
}

const inList = (field: string, ...values: string[]): Obj => ({ field, in: values });
const notIn = (field: string, ...values: string[]): Obj => ({ field, notIn: values });
const range = (min?: number, max?: number): Obj => ({
  field: 'price',
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
});
const group = (...atoms: Obj[]): Obj => ({ allOf: atoms });
const anyOf = (...groups: Obj[]): Obj => ({ anyOf: groups });
const only = (...atoms: Obj[]): Obj => anyOf(group(...atoms));
const NOTHING: Obj = { anyOf: [] };

const schedule = (startsAt: Date | null, endsAt: Date | null): Obj => ({
  startsAt,
  endsAt,
  timezone: 'Africa/Cairo',
});
const ms = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

function check(draftOver: Obj = {}, opts: Obj = {}) {
  const products = opts.products ?? [P1, P2, P3];
  const others = opts.others ?? [];
  const ctx = opts.ctx ?? VISITOR;
  return validateOffer(mk('draft', opts.reward ?? pct(10), draftOver) as never, products, others, ctx);
}
const codesOf = (list: readonly { code: string }[]): string[] => list.map((issue) => issue.code);
const messageOf = (list: readonly { code: string; message: string }[], code: string): string | undefined =>
  list.find((issue) => issue.code === code)?.message;

function price(offers: Obj[], p: Obj = P1, variant: Obj | null = null, ctx: Obj = VISITOR) {
  return priceItem(p as never, variant as never, offers as never, ctx as never);
}
function shown(offers: Obj[], p: Obj = P1, ctx: Obj = VISITOR) {
  return displayPrice(p as never, offers as never, ctx as never);
}

// ---------------------------------------------------------------------------------------------
// A. Offer form: errors and warnings (validateOffer)
// ---------------------------------------------------------------------------------------------

describe('A: form errors', () => {
  it('a normal offer saves with no errors', () => {
    assert.deepEqual(check({ name: 'QA 10%', title: '10% off' }).errors, []);
  });

  it('A2: empty internal name is an error that blocks Save', () => {
    const { errors } = check({ name: '' });
    assert.equal(messageOf(errors, 'name'), 'Give this offer an internal name between 1 and 80 characters.');
  });

  it('A3: empty customer title is an error (1 to 60 characters)', () => {
    const { errors } = check({ title: '' });
    assert.equal(messageOf(errors, 'title'), 'Give shoppers a short title between 1 and 60 characters.');
  });

  it('A4: a name or title of only spaces counts as empty', () => {
    const { errors } = check({ name: '   ', title: '\t  \n' });
    assert.deepEqual(codesOf(errors).sort(), ['name', 'title']);
  });

  it('A5: name stops at 80, title at 60, badge at 24 characters (trimmed)', () => {
    assert.deepEqual(
      check({ name: 'a'.repeat(80), title: 'b'.repeat(60), badge: 'c'.repeat(24) }).errors,
      [],
    );
    assert.deepEqual(codesOf(check({ name: 'a'.repeat(81) }).errors), ['name']);
    assert.deepEqual(codesOf(check({ title: 'b'.repeat(61) }).errors), ['title']);
    assert.deepEqual(codesOf(check({ badge: 'c'.repeat(25) }).errors), ['badge']);
    // Spaces around the text don't count; a badge of only spaces is no badge at all.
    assert.deepEqual(check({ name: ` ${'a'.repeat(80)} `, badge: ' '.repeat(30) }).errors, []);
    assert.deepEqual(
      messageOf(check({ badge: 'c'.repeat(25) }).errors, 'badge'),
      'Keep the badge under 24 characters so it fits on product cards.',
    );
  });

  it('A7: a badge that promises more than the rule gives warns (save still allowed)', () => {
    const result = check({ badge: '50% OFF' });
    assert.deepEqual(result.errors, []);
    assert.equal(
      messageOf(result.warnings, 'badge.overpromise'),
      'The badge mentions 50%, while the rule gives 10%.',
    );
  });

  it('A7: no warning when the badge promises the same or less, or names no percent', () => {
    for (const badge of ['10% off', '5 % off', 'Black Friday', 'Up to EGP 100']) {
      assert.ok(!codesOf(check({ badge }).warnings).includes('badge.overpromise'), badge);
    }
  });

  it('A7: Buy X Get Y compares the badge with its own discount percent', () => {
    const reward = { ...BXGY, get: { quantity: 1, percent: 50 } };
    assert.equal(
      messageOf(check({ badge: '100% off' }, { reward }).warnings, 'badge.overpromise'),
      'The badge mentions 100%, while the rule gives 50%.',
    );
  });

  it('A8: no product rules warns that every product is covered', () => {
    assert.equal(
      messageOf(check().warnings, 'conditions.all'),
      'No product filters are set, so this offer applies to every product in the store.',
    );
    assert.ok(
      !codesOf(check({ conditions: only(inList('brandId', 'brand-a')) }).warnings).includes('conditions.all'),
    );
  });

  it('A9: rules that match nothing warn', () => {
    const result = check({ conditions: only(range(999999)) });
    assert.equal(messageOf(result.warnings, 'conditions.zero'), 'No current products match these rules yet.');
  });

  it('A9: no "match nothing" warning when something matches, or when the catalogue is empty', () => {
    assert.ok(!codesOf(check({ conditions: only(range(500)) }).warnings).includes('conditions.zero'));
    assert.ok(
      !codesOf(check({ conditions: only(range(999999)) }, { products: [] }).warnings).includes(
        'conditions.zero',
      ),
    );
  });

  it('A9/E11: Except can empty the match; min above max matches nothing', () => {
    assert.ok(
      codesOf(check({ exclude: only(range(0)) }).warnings).includes('conditions.zero'),
      'excluding every product',
    );
    assert.ok(codesOf(check({ conditions: only(range(2000, 500)) }).warnings).includes('conditions.zero'));
  });

  it('A16: priority is saved between -100 and 100', () => {
    const read = (priority: unknown) =>
      parseOfferDoc('o', { name: 'o', title: 'o', reward: pct(10), priority })?.priority;
    assert.equal(read(500), 100);
    assert.equal(read(-500), -100);
    assert.equal(read(100), 100);
    assert.equal(read(-100), -100);
    assert.equal(read(7.6), 8);
    assert.equal(read('5'), 0);
    assert.equal(read(undefined), 0);
  });

  it('A19: another live offer on the same products warns "whichever is cheaper"', () => {
    const other = mk('Other', pct(20));
    const result = check({}, { products: [P1, P3], others: [other] });
    assert.equal(
      messageOf(result.warnings, 'overlap.Other'),
      '2 products are also in "Other". Shoppers get whichever is cheaper.',
    );
    // One shared product reads in the singular.
    const single = check(
      { conditions: only(inList('productId', 'p1')) },
      { products: [P1, P3], others: [other] },
    );
    assert.equal(
      messageOf(single.warnings, 'overlap.Other'),
      '1 product is also in "Other". Shoppers get whichever is cheaper.',
    );
  });
});

describe('C: schedule errors and warnings', () => {
  it('C6: an end before the start is an error', () => {
    const { errors } = check({ schedule: schedule(ms(2 * HOUR), ms(HOUR)) });
    assert.equal(messageOf(errors, 'schedule.order'), 'The end time must be after the start time.');
  });

  it('C7: an end equal to the start is an error; one millisecond later is fine', () => {
    assert.deepEqual(codesOf(check({ schedule: schedule(ms(HOUR), ms(HOUR)) }).errors), ['schedule.order']);
    assert.deepEqual(check({ schedule: schedule(ms(HOUR), ms(HOUR + 1)) }).errors, []);
  });

  it('C8: a start in the past warns, with one minute of grace', () => {
    const warn = (offset: number) =>
      codesOf(check({ schedule: schedule(ms(offset), null) }).warnings).includes('schedule.pastStart');
    assert.equal(warn(-HOUR), true);
    assert.equal(warn(-MIN - 1), true);
    assert.equal(warn(-MIN), false, 'exactly one minute ago is still "now"');
    assert.equal(warn(0), false);
    assert.equal(warn(HOUR), false);
    assert.equal(
      messageOf(check({ schedule: schedule(ms(-HOUR), null) }).warnings, 'schedule.pastStart'),
      'The start time is in the past, so this offer starts as soon as it is active.',
    );
  });

  it('C9: an end within one hour warns; exactly one hour, no end, or already ended do not', () => {
    const warn = (endOffset: number | null) =>
      codesOf(
        check({ schedule: schedule(null, endOffset === null ? null : ms(endOffset)) }).warnings,
      ).includes('schedule.shortEnd');
    assert.equal(warn(30 * MIN), true);
    assert.equal(warn(HOUR - 1), true);
    assert.equal(warn(HOUR), false);
    assert.equal(warn(0), false);
    assert.equal(warn(-MIN), false);
    assert.equal(warn(null), false);
    assert.equal(
      messageOf(check({ schedule: schedule(null, ms(30 * MIN)) }).warnings, 'schedule.shortEnd'),
      'This offer ends in less than 1 hour.',
    );
  });
});

describe('F, G, H: reward errors and warnings', () => {
  it('F4: percent off must be 1 to 100', () => {
    for (const percent of [0, -5, 101, 150, Number.NaN]) {
      assert.equal(
        messageOf(check({}, { reward: pct(percent) }).errors, 'reward.percent'),
        'Enter a discount percentage between 1 and 100.',
        String(percent),
      );
    }
    for (const percent of [1, 50, 100]) {
      assert.ok(!codesOf(check({}, { reward: pct(percent) }).errors).includes('reward.percent'));
    }
  });

  it('F5: a percent above 60 warns "takes N% off"; 60 does not', () => {
    assert.equal(
      messageOf(check({}, { reward: pct(70) }).warnings, 'reward.highPercent'),
      'This takes 70% off matching products.',
    );
    assert.ok(codesOf(check({}, { reward: pct(61) }).warnings).includes('reward.highPercent'));
    assert.ok(!codesOf(check({}, { reward: pct(60) }).warnings).includes('reward.highPercent'));
  });

  it('G3: amount off must be at least EGP 1', () => {
    for (const amount of [0, -5, 0.5]) {
      assert.equal(
        messageOf(check({}, { reward: amt(amount) }).errors, 'reward.amount'),
        'Enter a discount amount of at least EGP 1.',
        String(amount),
      );
    }
    assert.ok(!codesOf(check({}, { reward: amt(1) }).errors).includes('reward.amount'));
  });

  it('G2: an amount that is the full price (or more) warns the product becomes free', () => {
    const one = check({ conditions: only(inList('productId', 'p1')) }, { reward: amt(1500) });
    assert.equal(
      messageOf(one.warnings, 'reward.amountFree'),
      'The discount is at least the full price for 1 product, which becomes free.',
    );
    // 200 off a 200 product is free too (equal counts); the 800 and 1,000 products are not.
    const equal = check({}, { reward: amt(200) });
    assert.equal(
      messageOf(equal.warnings, 'reward.amountFree'),
      'The discount is at least the full price for 1 product, which becomes free.',
    );
    const all = check({}, { reward: amt(1500) });
    assert.equal(
      messageOf(all.warnings, 'reward.amountFree'),
      'The discount is at least the full price for 3 products, which become free.',
    );
    assert.ok(!codesOf(check({}, { reward: amt(199) }).warnings).includes('reward.amountFree'));
  });

  it('H: set price must be EGP 0 or higher (0 is allowed)', () => {
    assert.equal(
      messageOf(check({}, { reward: fixed(-1) }).errors, 'reward.fixedPrice'),
      'Enter a fixed price of EGP 0 or higher.',
    );
    assert.ok(!codesOf(check({}, { reward: fixed(0) }).errors).includes('reward.fixedPrice'));
  });

  it('H2/H3: a set price at or above the current price warns that those products are skipped', () => {
    const higher = check({ conditions: only(inList('productId', 'p1')) }, { reward: fixed(1200) });
    assert.equal(
      messageOf(higher.warnings, 'reward.fixedPriceHigher'),
      'The set price is higher than or equal to the current price for 1 product, which will be skipped.',
    );
    const equal = check({ conditions: only(inList('productId', 'p1')) }, { reward: fixed(1000) });
    assert.ok(codesOf(equal.warnings).includes('reward.fixedPriceHigher'));
    // 500 is below P1 (1,000) and P2 (800) but not P3 (200): one product skipped.
    const some = check({}, { reward: fixed(500) });
    assert.equal(
      messageOf(some.warnings, 'reward.fixedPriceHigher'),
      'The set price is higher than or equal to the current price for 1 product, which will be skipped.',
    );
    const many = check({}, { reward: fixed(5000) });
    assert.equal(
      messageOf(many.warnings, 'reward.fixedPriceHigher'),
      'The set price is higher than or equal to the current price for 3 products, which are skipped.',
    );
    assert.ok(!codesOf(check({}, { reward: fixed(100) }).warnings).includes('reward.fixedPriceHigher'));
  });
});

describe('J: Buy X Get Y validation', () => {
  const bxgy = (over: Obj = {}): Obj => ({ ...BXGY, ...over });

  it('J26: Buy 0 and Get 0 are errors (the form turns them into 1)', () => {
    const { errors } = check(
      {},
      { reward: bxgy({ buy: { quantity: 0 }, get: { quantity: 0, percent: 100 } }) },
    );
    assert.equal(messageOf(errors, 'reward.buyQuantity'), 'The "Buy" quantity must be at least 1.');
    assert.equal(messageOf(errors, 'reward.getQuantity'), 'The "Get" quantity must be at least 1.');
  });

  it('J26: Get discount % of 150 is an error; 1 and 100 are fine', () => {
    const message = 'The "Get" discount percentage must be between 1 and 100.';
    assert.equal(
      messageOf(
        check({}, { reward: bxgy({ get: { quantity: 1, percent: 150 } }) }).errors,
        'reward.getPercent',
      ),
      message,
    );
    for (const percent of [1, 50, 100]) {
      assert.ok(
        !codesOf(check({}, { reward: bxgy({ get: { quantity: 1, percent } }) }).errors).includes(
          'reward.getPercent',
        ),
      );
    }
  });

  it('J26b: Get discount % of 0 is an error, never silently 100 (ATS-142)', () => {
    for (const percent of [0, -1]) {
      assert.equal(
        messageOf(check({}, { reward: bxgy({ get: { quantity: 1, percent } }) }).errors, 'reward.getPercent'),
        'The "Get" discount percentage must be between 1 and 100.',
      );
    }
    // A saved 0 is kept as 0 when read back, so the error still shows instead of a free item.
    const parsed = parseOfferDoc('o', {
      name: 'o',
      title: 'o',
      reward: { kind: 'buyXGetY', buy: { quantity: 2 }, get: { quantity: 1, percent: 0 } },
    });
    assert.equal((parsed?.reward as Obj).get.percent, 0);
  });

  it('J26: an empty Max times means no limit when an offer is read back', () => {
    const read = (maxApplications: unknown) =>
      (
        parseOfferDoc('o', {
          name: 'o',
          title: 'o',
          reward: {
            kind: 'buyXGetY',
            buy: { quantity: 2 },
            get: { quantity: 1, percent: 100 },
            maxApplications,
          },
        })?.reward as Obj
      ).maxApplications;
    assert.equal(read(undefined), null);
    assert.equal(read(null), null);
    assert.equal(read(3), 3);
  });

  it('J14: "One of these products" with none picked is an error', () => {
    const empty = bxgy({ getConditions: only(inList('productId')) });
    assert.equal(
      messageOf(check({}, { reward: empty }).errors, 'reward.freeItemProducts'),
      'Pick at least one product that can be the free item.',
    );
    const picked = bxgy({ getConditions: only(inList('productId', 'p3')) });
    assert.deepEqual(check({}, { reward: picked }).errors, []);
  });

  it('J16: "Any item from a category or brand" with nothing picked is an error', () => {
    for (const getConditions of [
      only(inList('categoryIds')),
      only(inList('brandId')),
      NOTHING,
      only(range(100, 500)),
    ]) {
      assert.equal(
        messageOf(check({}, { reward: bxgy({ getConditions }) }).errors, 'reward.freeItemGroup'),
        'Pick at least one category or brand for the free item.',
      );
    }
    for (const getConditions of [
      only(inList('categoryIds', 'balls')),
      only(inList('brandId', 'brand-b')),
      anyOf(group(inList('categoryIds', 'balls')), group(inList('brandId'))),
    ]) {
      assert.deepEqual(check({}, { reward: bxgy({ getConditions }) }).errors, []);
    }
  });

  it('J: "the cheapest of them" (no free-item rule) needs nothing extra', () => {
    assert.deepEqual(check({}, { reward: bxgy({ getConditions: null }) }).errors, []);
  });

  it('J: Buy X Get Y and Free shipping are no longer called "label only" (ATS-141)', () => {
    for (const reward of [BXGY, SHIP]) {
      const { warnings } = check({}, { reward });
      assert.ok(!codesOf(warnings).includes('reward.labelOnly'));
      assert.ok(warnings.every((warning) => !/label/i.test(warning.message)));
    }
    // Free shipping saved as an order-wide offer isn't a label either.
    assert.ok(!codesOf(check({ scope: 'cart' }, { reward: SHIP }).warnings).includes('reward.labelOnly'));
  });
});

describe('L: Free gift validation', () => {
  const gifts = (list: Obj[]): Obj => ({ kind: 'freeGift', gifts: list });
  const gift = (id: string, name: string, productIds: string[]): Obj => ({ id, name, productIds });

  it('a gift with a name and a choice saves with no errors', () => {
    assert.deepEqual(check({}, { reward: GIFT }).errors, []);
  });

  it('no gifts at all is an error', () => {
    assert.equal(
      messageOf(check({}, { reward: gifts([]) }).errors, 'reward.gifts'),
      'Add at least one gift.',
    );
  });

  it('L13: a gift with no choices is an error that names the gift', () => {
    assert.equal(
      messageOf(check({}, { reward: gifts([gift('g1', 'Free shirt', [])]) }).errors, 'reward.giftChoices'),
      'Choose at least one product shoppers can pick for "Free shirt".',
    );
    assert.equal(
      messageOf(check({}, { reward: gifts([gift('g1', '  ', [])]) }).errors, 'reward.giftChoices'),
      'Choose at least one product shoppers can pick for "this gift".',
    );
  });

  it('L14: a gift name must be 1 to 40 characters', () => {
    const message = 'Give each gift a short name between 1 and 40 characters, e.g. "Free shirt".';
    for (const name of ['', '   ', 'x'.repeat(41)]) {
      assert.equal(
        messageOf(check({}, { reward: gifts([gift('g1', name, ['p3'])]) }).errors, 'reward.giftName'),
        message,
        JSON.stringify(name),
      );
    }
    assert.deepEqual(check({}, { reward: gifts([gift('g1', 'x'.repeat(40), ['p3'])]) }).errors, []);
  });

  it('L15: at most 5 gifts', () => {
    const many = (count: number) =>
      gifts(Array.from({ length: count }, (_, i) => gift(`g${i + 1}`, `Gift ${i + 1}`, ['p3'])));
    assert.deepEqual(check({}, { reward: many(5) }).errors, []);
    assert.equal(messageOf(check({}, { reward: many(6) }).errors, 'reward.giftsCount'), 'Add up to 5 gifts.');
  });

  it('L15: at most 20 choices per gift', () => {
    const choices = (count: number) =>
      gifts([
        gift(
          'g1',
          'Free shirt',
          Array.from({ length: count }, (_, i) => `p-${i}`),
        ),
      ]);
    assert.deepEqual(check({}, { reward: choices(20), products: [] }).errors, []);
    assert.equal(
      messageOf(check({}, { reward: choices(21), products: [] }).errors, 'reward.giftChoicesCount'),
      'Each gift can offer up to 20 products to choose from.',
    );
  });

  it('gifts need their own ids, and every choice must exist in the catalogue', () => {
    const twice = gifts([gift('g1', 'Free shirt', ['p3']), gift('g1', 'Free socks', ['p3'])]);
    assert.ok(codesOf(check({}, { reward: twice }).errors).includes('reward.giftId'));
    assert.equal(
      messageOf(
        check({}, { reward: gifts([gift('g1', 'Free shirt', ['nope'])]) }).errors,
        'reward.giftMissing',
      ),
      'One of the gift products could not be found in the catalogue.',
    );
  });
});

describe('E18: limits on conditions', () => {
  const atom = inList('brandId', 'brand-a');

  it('up to 10 groups; the 11th is an error (also for Except)', () => {
    const groups = (count: number) => anyOf(...Array.from({ length: count }, () => group(atom)));
    assert.ok(!codesOf(check({ conditions: groups(10) }).errors).includes('conditions.groups'));
    assert.equal(
      messageOf(check({ conditions: groups(11) }).errors, 'conditions.groups'),
      'Use up to 10 condition groups.',
    );
    assert.equal(
      messageOf(check({ exclude: groups(11) }).errors, 'exclude.groups'),
      'Use up to 10 condition groups.',
    );
  });

  it('up to 10 rules in a group; the 11th is an error', () => {
    const rules = (count: number) => only(...Array.from({ length: count }, () => atom));
    assert.ok(!codesOf(check({ conditions: rules(10) }).errors).includes('conditions.atoms'));
    assert.equal(
      messageOf(check({ conditions: rules(11) }).errors, 'conditions.atoms'),
      'Each condition group can have up to 10 rules.',
    );
  });

  it('a rule picks up to 200 values', () => {
    const values = (count: number) =>
      only(inList('productId', ...Array.from({ length: count }, (_, i) => `p-${i}`)));
    assert.ok(!codesOf(check({ conditions: values(200) }).errors).includes('conditions.values'));
    assert.equal(
      messageOf(check({ conditions: values(201) }).errors, 'conditions.values'),
      'Each rule can pick up to 200 values.',
    );
  });
});

describe('top banner validation', () => {
  const banner = (over: Obj = {}): Obj => ({
    show: true,
    text: null,
    countdown: 'hide',
    countdownDays: 7,
    ...over,
  });

  it('banner text stays within 60 characters', () => {
    assert.deepEqual(check({ banner: banner({ text: 'x'.repeat(60) }) }).errors, []);
    assert.equal(
      messageOf(check({ banner: banner({ text: 'x'.repeat(61) }) }).errors, 'banner.text'),
      'Keep the banner text under 60 characters so it fits on one line.',
    );
  });

  it('the countdown window is a whole number from 1 to 30 days (only when it is used)', () => {
    for (const countdownDays of [0, 31, 7.5, Number.NaN]) {
      assert.equal(
        messageOf(
          check({ banner: banner({ countdown: 'lastDays', countdownDays }) }).errors,
          'banner.countdownDays',
        ),
        'Show the countdown in the last 1 to 30 days.',
        String(countdownDays),
      );
    }
    for (const countdownDays of [1, 7, 30]) {
      assert.deepEqual(check({ banner: banner({ countdown: 'lastDays', countdownDays }) }).errors, []);
    }
    assert.deepEqual(check({ banner: banner({ countdown: 'always', countdownDays: 99 }) }).errors, []);
  });

  it('only offers for everyone can be in the banner', () => {
    assert.equal(
      messageOf(check({ audience: 'signedIn', banner: banner() }).errors, 'banner.audience'),
      'Only offers for everyone can show in the top banner.',
    );
    assert.deepEqual(check({ audience: 'signedIn', banner: banner({ show: false }) }).errors, []);
  });
});

// ---------------------------------------------------------------------------------------------
// C, D: which offers are live (liveOffers)
// ---------------------------------------------------------------------------------------------

describe('C: liveOffers schedule', () => {
  const ids = (offers: Obj[], ctx: Obj = VISITOR) =>
    liveOffers(offers as never, ctx as never).map((o) => o.id);

  it('C1: no dates means live as long as it is active', () => {
    assert.deepEqual(ids([mk('a', pct(10))]), ['a']);
  });

  it('C4: an offer with a start in the future is not live until its start', () => {
    const offer = mk('a', pct(10), { schedule: schedule(ms(10 * MIN), null) });
    assert.deepEqual(ids([offer]), []);
    assert.deepEqual(ids([offer], { ...VISITOR, now: ms(10 * MIN - 1) }), []);
    assert.deepEqual(ids([offer], { ...VISITOR, now: ms(10 * MIN) }), ['a'], 'live at exactly startsAt');
  });

  it('C5/C10: an offer stops at its end (exactly endsAt is already over)', () => {
    const offer = mk('a', pct(10), { schedule: schedule(null, ms(10 * MIN)) });
    assert.deepEqual(ids([offer]), ['a']);
    assert.deepEqual(ids([offer], { ...VISITOR, now: ms(10 * MIN - 1) }), ['a'], 'one millisecond left');
    assert.deepEqual(ids([offer], { ...VISITOR, now: ms(10 * MIN) }), [], 'gone at exactly endsAt');
    assert.deepEqual(ids([offer], { ...VISITOR, now: ms(10 * MIN + 1) }), []);
    const yesterday = mk('b', pct(10), { schedule: schedule(null, ms(-24 * HOUR)) });
    assert.deepEqual(ids([yesterday]), []);
  });

  it('B1/B3/C17: paused and archived offers are never live, even inside their dates', () => {
    assert.deepEqual(ids([mk('a', pct(10), { active: false })]), []);
    assert.deepEqual(ids([mk('a', pct(10), { archived: true })]), []);
    // Paused with a future start: never starts until resumed.
    const scheduledAndPaused = mk('a', pct(10), { active: false, schedule: schedule(ms(HOUR), null) });
    assert.deepEqual(ids([scheduledAndPaused], { ...VISITOR, now: ms(2 * HOUR) }), []);
  });

  it('C13: Cairo midnight edges (00:00 to 23:59 on 10 Nov is 22:00Z to 21:59Z)', () => {
    const startsAt = parseCairoDateTimeInput('2026-11-10T00:00');
    const endsAt = parseCairoDateTimeInput('2026-11-10T23:59');
    assert.equal(startsAt?.toISOString(), '2026-11-09T22:00:00.000Z');
    assert.equal(endsAt?.toISOString(), '2026-11-10T21:59:00.000Z');
    const offer = mk('a', pct(10), { schedule: schedule(startsAt, endsAt) });
    const at = (iso: string) => ids([offer], { ...VISITOR, now: new Date(iso) });
    assert.deepEqual(at('2026-11-09T21:59:59Z'), [], '23:59:59 Cairo the day before');
    assert.deepEqual(at('2026-11-09T22:00:00Z'), ['a'], 'Cairo midnight');
    assert.deepEqual(at('2026-11-10T12:00:00Z'), ['a']);
    assert.deepEqual(at('2026-11-10T21:58:59Z'), ['a']);
    assert.deepEqual(at('2026-11-10T21:59:00Z'), [], '23:59 Cairo is the end');
  });

  it('keeps several live offers and drops only the ones that are not', () => {
    const offers = [
      mk('live', pct(10)),
      mk('paused', pct(10), { active: false }),
      mk('later', pct(10), { schedule: schedule(ms(HOUR), null) }),
      mk('over', pct(10), { schedule: schedule(null, ms(-HOUR)) }),
    ];
    assert.deepEqual(ids(offers), ['live']);
  });
});

describe('D: audience', () => {
  it('a once-per-customer offer is only for signed-in shoppers, even when it is for everyone', () => {
    const offer = mk('a', pct(10), { limits: { totalUses: null, perCustomer: 1 } });
    assert.equal(liveOffers([offer] as never, VISITOR as never).length, 0);
    assert.equal(liveOffers([offer] as never, SHOPPER as never).length, 1);
    assert.equal(price([offer], P1, null, VISITOR).effectivePrice, 1000);
    assert.equal(price([offer], P1, null, SHOPPER).effectivePrice, 900);
    const totalOnly = mk('b', pct(10), { limits: { totalUses: 5, perCustomer: null } });
    assert.equal(liveOffers([totalOnly] as never, VISITOR as never).length, 1);
  });

  it('D1: an offer for everyone is live for visitors and signed-in shoppers', () => {
    const offer = mk('a', pct(10));
    assert.equal(liveOffers([offer] as never, VISITOR as never).length, 1);
    assert.equal(liveOffers([offer] as never, SHOPPER as never).length, 1);
    assert.equal(price([offer], P1, null, VISITOR).effectivePrice, 900);
    assert.equal(price([offer], P1, null, SHOPPER).effectivePrice, 900);
  });

  it('D2: a signed-in-only offer gives a visitor no discount and no badge', () => {
    const offer = mk('a', pct(10), { audience: 'signedIn' });
    const result = price([offer], P1, null, VISITOR);
    assert.equal(result.effectivePrice, 1000);
    assert.equal(result.appliedOfferId, null);
    assert.deepEqual(result.badges, []);
    const card = shown([offer], P1, VISITOR);
    assert.equal(card.fromPrice, 1000);
    assert.deepEqual(card.offerIds, []);
  });

  it('D3: the same offer discounts a signed-in shopper', () => {
    const offer = mk('a', pct(10), { audience: 'signedIn' });
    const result = price([offer], P1, null, SHOPPER);
    assert.equal(result.effectivePrice, 900);
    assert.equal(result.appliedOfferId, 'a');
    assert.equal(shown([offer], P1, SHOPPER).fromPrice, 900);
  });
});

// ---------------------------------------------------------------------------------------------
// Cairo time (C11, C12)
// ---------------------------------------------------------------------------------------------

describe('C11/C12: Cairo time and Egypt summer time', () => {
  const wall = (year: number, month: number, day: number, hour: number, minute = 0, second = 0) =>
    cairoWallTimeToDate({ year, month, day, hour, minute, second }).toISOString();

  it('C12: summer is UTC+3, winter UTC+2, so 12:00 stays 12:00 after a round trip', () => {
    assert.equal(wall(2026, 7, 1, 12), '2026-07-01T09:00:00.000Z');
    assert.equal(wall(2026, 12, 1, 12), '2026-12-01T10:00:00.000Z');
    for (const input of ['2026-07-01T12:00', '2026-12-01T12:00', '2027-01-15T00:00', '2026-07-31T23:59']) {
      assert.equal(formatCairoDateTimeInput(parseCairoDateTimeInput(input)), input);
    }
  });

  it('C12: the switch dates of 2026 (clocks forward on 24 Apr, back on 29 Oct)', () => {
    assert.equal(wall(2026, 4, 23, 23, 59), '2026-04-23T21:59:00.000Z', 'still winter time');
    assert.equal(wall(2026, 4, 24, 1, 0), '2026-04-23T22:00:00.000Z', 'first hour of summer time');
    assert.equal(wall(2026, 10, 29, 22, 59), '2026-10-29T19:59:00.000Z', 'last summer hour');
    assert.equal(wall(2026, 10, 30, 0, 0), '2026-10-29T22:00:00.000Z', 'winter time again');
  });

  it('C11: the answer depends on the instant, not on the machine clock zone', () => {
    // Midnight in Cairo is hour 0 of the next day, never "24".
    const midnight = dateToCairoWallTime(new Date('2026-11-09T22:00:00Z'));
    assert.deepEqual(midnight, { year: 2026, month: 11, day: 10, hour: 0, minute: 0, second: 0 });
    const evening = dateToCairoWallTime(new Date('2026-11-10T18:00:00Z'));
    assert.equal(evening.hour, 20);
    assert.equal(formatCairoDateTimeInput(new Date('2026-11-10T18:00:00Z')), '2026-11-10T20:00');
  });

  it('parses "T" and space separators, seconds, and date-only values', () => {
    assert.equal(parseCairoDateTimeInput('2026-11-10T20:00')?.toISOString(), '2026-11-10T18:00:00.000Z');
    assert.equal(parseCairoDateTimeInput('2026-11-10 20:00')?.toISOString(), '2026-11-10T18:00:00.000Z');
    assert.equal(parseCairoDateTimeInput('2026-11-10T20:00:30')?.toISOString(), '2026-11-10T18:00:30.000Z');
    assert.equal(parseCairoDateTimeInput('  2026-11-10T20:00  ')?.toISOString(), '2026-11-10T18:00:00.000Z');
    assert.equal(parseCairoDateTimeInput('2026-11-10')?.toISOString(), '2026-11-09T22:00:00.000Z');
    assert.equal(parseCairoDateTimeInput('2026-11-10', true)?.toISOString(), '2026-11-10T21:59:59.000Z');
    // A date with a time ignores the end-of-day flag.
    assert.equal(
      parseCairoDateTimeInput('2026-11-10T08:00', true)?.toISOString(),
      '2026-11-10T06:00:00.000Z',
    );
    assert.equal(parseCairoDateTimeInput('2026-07-01', true)?.toISOString(), '2026-07-01T20:59:59.000Z');
  });

  it('rejects empty and badly written values', () => {
    for (const bad of ['', '   ', 'tomorrow', '10/11/2026', '2026-11-10T25', '2026-11-1']) {
      assert.equal(parseCairoDateTimeInput(bad), null, JSON.stringify(bad));
    }
  });

  it('formats for the form and the list', () => {
    assert.equal(formatCairoDateTimeInput(null), '');
    assert.equal(formatCairoDisplay(null), '');
    assert.equal(formatCairoDisplay(new Date('2026-11-10T12:00:00Z')), '10 Nov 2026, 14:00');
    assert.equal(formatCairoDisplay(new Date('2026-07-01T09:00:00Z')), '01 Jul 2026, 12:00');
    assert.equal(
      formatCairoDate(new Date('2026-11-14T23:30:00Z')),
      '15 Nov 2026',
      'already the 15th in Cairo',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// E. Which products (match.ts)
// ---------------------------------------------------------------------------------------------

describe('E: matching conditions', () => {
  const shirt = product({
    productId: 'shirt',
    brandId: 'adidas',
    categoryIds: ['apparel', 't-shirts'],
    type: 'tshirt',
    modelGroup: 'polo-1',
    tags: ['summer', 'new'],
  });
  const ball = product({
    productId: 'ball',
    brandId: 'nox',
    categoryIds: ['padel', 'balls'],
    type: 'ball',
    modelGroup: null,
  });
  const level = (conditions: Obj, p: Obj = shirt, exclude: Obj = NOTHING) =>
    matchProduct(conditions as never, exclude as never, p as never);

  it('no rules match every product', () => {
    assert.equal(level(NOTHING, shirt), 'full');
    assert.equal(level(NOTHING, ball), 'full');
  });

  it('E1: brand', () => {
    const rule = only(inList('brandId', 'adidas'));
    assert.equal(level(rule, shirt), 'full');
    assert.equal(level(rule, ball), 'none');
  });

  it('E2: a parent category also matches products in its child categories', () => {
    const rule = only(inList('categoryIds', 'apparel'));
    assert.equal(level(rule, shirt), 'full');
    assert.equal(level(rule, ball), 'none');
  });

  it('E3: a child category matches only that child', () => {
    const rule = only(inList('categoryIds', 't-shirts'));
    assert.equal(level(rule, shirt), 'full');
    assert.equal(level(rule, product({ categoryIds: ['apparel', 'hoodies'] })), 'none');
    assert.equal(level(only(inList('categoryIds', 'hoodies', 't-shirts')), shirt), 'full', 'one of several');
  });

  it('E4: a specific product', () => {
    const rule = only(inList('productId', 'shirt'));
    assert.equal(level(rule, shirt), 'full');
    assert.equal(level(rule, ball), 'none');
  });

  it('E5: product type', () => {
    const rule = only(inList('type', 'ball'));
    assert.equal(level(rule, ball), 'full');
    assert.equal(level(rule, shirt), 'none');
  });

  it('E6: tag, and a "not one of" tag leaves out any product that has it', () => {
    assert.equal(level(only(inList('tags', 'new')), shirt), 'full');
    assert.equal(level(only(inList('tags', 'new')), ball), 'none', 'no tags at all');
    assert.equal(level(only(notIn('tags', 'new')), shirt), 'none');
    assert.equal(level(only(notIn('tags', 'new')), ball), 'full');
    assert.equal(level(only(notIn('tags', 'sale')), shirt), 'full', 'it has none of the listed tags');
  });

  it('E7: model group (every colour of a model); products with no model only match "not one of"', () => {
    assert.equal(level(only(inList('modelGroup', 'polo-1')), shirt), 'full');
    assert.equal(level(only(inList('modelGroup', 'polo-2')), shirt), 'none');
    assert.equal(level(only(inList('modelGroup', 'polo-1')), ball), 'none');
    assert.equal(level(only(notIn('modelGroup', 'polo-1')), ball), 'full');
    assert.equal(level(only(notIn('modelGroup', 'polo-1')), shirt), 'none');
  });

  it('E10: price range uses the selling price (inclusive), not the old price', () => {
    const rule = only(range(500, 900));
    assert.equal(level(rule, P1), 'none', '1,000');
    assert.equal(level(rule, P2), 'full', 'on sale at 800 (was 1,000)');
    assert.equal(level(rule, P3), 'none', '200');
    assert.equal(level(only(range(800, 800)), P2), 'full', 'min and max are inclusive');
    assert.equal(level(only(range(801)), P2), 'none');
    assert.equal(level(only(range(undefined, 799)), P2), 'none');
    assert.equal(level(only(range(500)), P1), 'full', 'only a minimum');
    assert.equal(level(only(range(undefined, 1000)), P1), 'full', 'only a maximum');
  });

  it('E11: a minimum above the maximum matches nothing', () => {
    for (const p of [P1, P2, P3]) assert.equal(level(only(range(2000, 500)), p), 'none');
  });

  it('E12: "is not one of" matches everything except those', () => {
    const rule = only(notIn('brandId', 'adidas'));
    assert.equal(level(rule, shirt), 'none');
    assert.equal(level(rule, ball), 'full');
  });

  it('E13: two rules in one group must both match (AND)', () => {
    const rule = only(inList('brandId', 'adidas'), inList('categoryIds', 't-shirts'));
    assert.equal(level(rule, shirt), 'full');
    assert.equal(level(rule, product({ brandId: 'adidas', categoryIds: ['apparel', 'hoodies'] })), 'none');
    assert.equal(level(rule, product({ brandId: 'nox', categoryIds: ['apparel', 't-shirts'] })), 'none');
  });

  it('E14: two groups match when either does (OR)', () => {
    const rule = anyOf(group(inList('brandId', 'nox')), group(inList('categoryIds', 't-shirts')));
    assert.equal(level(rule, shirt), 'full');
    assert.equal(level(rule, ball), 'full');
    assert.equal(level(rule, product({ brandId: 'head', categoryIds: ['padel', 'rackets'] })), 'none');
  });

  it('E15: Except takes products out of "all products"', () => {
    const except = only(inList('productId', 'shirt'));
    assert.equal(level(NOTHING, shirt, except), 'none');
    assert.equal(level(NOTHING, ball, except), 'full');
  });

  it('E17: a product that is included and excluded is not matched (Except wins)', () => {
    const include = only(inList('productId', 'shirt'));
    assert.equal(level(include, shirt, include), 'none');
  });

  it('E17: Except by price range and by brand', () => {
    assert.equal(level(NOTHING, P1, only(range(900, 1100))), 'none');
    assert.equal(level(NOTHING, P3, only(range(900, 1100))), 'full');
    assert.equal(
      level(only(inList('categoryIds', 'apparel')), shirt, only(inList('brandId', 'adidas'))),
      'none',
    );
  });

  it('E19: a rule with nothing picked matches every product for that field', () => {
    for (const atom of [
      { field: 'brandId' },
      { field: 'brandId', in: [] },
      { field: 'categoryIds', in: [], notIn: [] },
      { field: 'colors' },
      { field: 'sizes', in: [] },
      { field: 'modelGroup', in: [] },
      { field: 'price' },
    ]) {
      assert.equal(level(only(atom), shirt), 'full', JSON.stringify(atom));
      assert.equal(level(only(atom), ball), 'full', JSON.stringify(atom));
    }
    assert.equal(level(anyOf({ allOf: [] }), ball), 'full', 'a group with no rules');
  });

  it('E19: an empty rule under Except leaves every product out', () => {
    assert.equal(level(NOTHING, shirt, only({ field: 'brandId' })), 'none');
  });

  it('E1/E15: matching has no effect on prices through an unrelated offer', () => {
    const brandOffer = mk('a', pct(10), { conditions: only(inList('brandId', 'brand-a')) });
    assert.equal(price([brandOffer], P1).effectivePrice, 900);
    assert.equal(price([brandOffer], P4).effectivePrice, 150);
    const exceptP1 = mk('b', pct(10), { exclude: only(inList('productId', 'p1')) });
    assert.equal(price([exceptP1], P1).effectivePrice, 1000);
    assert.equal(price([exceptP1], P3).effectivePrice, 180);
  });
});

describe('E8, E9, E16: sizes and colours (partial matches)', () => {
  const tee = product({ sizes: ['S', 'M', 'L'] });
  const twoColour = product({ productId: 'p5', name: 'P5', colors: ['black', 'white'] });
  const level = (conditions: Obj, p: Obj, exclude: Obj = NOTHING) =>
    matchProduct(conditions as never, exclude as never, p as never);
  const fits = (conditions: Obj, p: Obj, variant: Obj | null, exclude: Obj = NOTHING) =>
    matchVariant(conditions as never, exclude as never, p as never, variant as never);

  it('a size rule is partial when only some sizes match, full when all do, none when none do', () => {
    assert.equal(level(only(inList('sizes', 'M')), tee), 'partial');
    assert.equal(level(only(inList('sizes', 'S', 'M', 'L')), tee), 'full');
    assert.equal(level(only(inList('sizes', 'XL')), tee), 'none');
    assert.equal(level(only(inList('sizes', 'M', 'XL')), tee), 'partial');
  });

  it('a "not one of" size is partial when it takes some sizes out, none when it takes them all', () => {
    assert.equal(level(only(notIn('sizes', 'M')), tee), 'partial');
    assert.equal(level(only(notIn('sizes', 'S', 'M', 'L')), tee), 'none');
  });

  it('a colour rule works the same way on a two-colour product', () => {
    assert.equal(level(only(inList('colors', 'black')), twoColour), 'partial');
    assert.equal(level(only(inList('colors', 'black', 'white')), twoColour), 'full');
    assert.equal(level(only(inList('colors', 'red')), twoColour), 'none');
    assert.equal(level(only(notIn('colors', 'black')), twoColour), 'partial');
    assert.equal(level(only(notIn('colors', 'black', 'white')), twoColour), 'none');
  });

  it('a one-colour product matches or not, never partially', () => {
    const black = product({ colors: ['black'] });
    assert.equal(level(only(inList('colors', 'black')), black), 'full');
    assert.equal(level(only(inList('colors', 'white')), black), 'none');
    assert.equal(level(only(notIn('colors', 'black')), black), 'none');
  });

  it('a product with no colours cannot match a colour list, but passes "not one of"', () => {
    assert.equal(level(only(inList('colors', 'black')), P1), 'none');
    assert.equal(level(only(notIn('colors', 'black')), P1), 'full');
  });

  it('partial in one rule keeps the group partial; a full group elsewhere makes the whole thing full', () => {
    const colourAndBrand = only(inList('colors', 'black'), inList('brandId', 'brand-a'));
    assert.equal(level(colourAndBrand, twoColour), 'partial');
    assert.equal(
      level(only(inList('colors', 'black'), range(0, 500)), twoColour),
      'none',
      'price rule fails',
    );
    const either = anyOf(group(inList('colors', 'black')), group(inList('brandId', 'brand-a')));
    assert.equal(level(either, twoColour), 'full');
  });

  it('E8: size rule per variant: M matches, L does not', () => {
    const rule = only(inList('sizes', 'M'));
    assert.equal(fits(rule, tee, { id: 'm', size: 'M' }), true);
    assert.equal(fits(rule, tee, { id: 'l', size: 'L' }), false);
    assert.equal(fits(rule, tee, null), true, 'no variant chosen yet: some size matches');
    assert.equal(fits(only(inList('sizes', 'XL')), tee, null), false);
  });

  it('E9: colour rule per variant: black matches, white does not', () => {
    const rule = only(inList('colors', 'black'));
    assert.equal(fits(rule, twoColour, { id: 'b', color: 'black' }), true);
    assert.equal(fits(rule, twoColour, { id: 'w', color: 'white' }), false);
    assert.equal(
      fits(rule, twoColour, { id: 'any', color: null }),
      true,
      'a variant with no colour keeps the product colours',
    );
  });

  it('E16: Except a colour: white variant matches, black does not (the product still matches)', () => {
    const except = only(inList('colors', 'black'));
    assert.equal(level(NOTHING, twoColour, except), 'full', 'the product as a whole is not excluded');
    assert.equal(fits(NOTHING, twoColour, { id: 'b', color: 'black' }, except), false);
    assert.equal(fits(NOTHING, twoColour, { id: 'w', color: 'white' }, except), true);
  });

  it('a variant must match colour and size rules together', () => {
    const rule = only(inList('colors', 'black'), inList('sizes', 'M'));
    const p = product({ colors: ['black', 'white'], sizes: ['S', 'M'] });
    assert.equal(fits(rule, p, { id: '1', color: 'black', size: 'M' }), true);
    assert.equal(fits(rule, p, { id: '2', color: 'black', size: 'S' }), false);
    assert.equal(fits(rule, p, { id: '3', color: 'white', size: 'M' }), false);
  });

  it('partialColorSummary lists the colours a rule picks, only when some are left out', () => {
    assert.deepEqual(partialColorSummary(only(inList('colors', 'black')) as never, twoColour as never), [
      'black',
    ]);
    assert.deepEqual(
      partialColorSummary(only(inList('colors', 'black', 'white')) as never, twoColour as never),
      [],
    );
    assert.deepEqual(partialColorSummary(only(inList('colors', 'red')) as never, twoColour as never), []);
    assert.deepEqual(
      partialColorSummary(only(inList('colors', 'black')) as never, product({ colors: ['black'] }) as never),
      [],
      'a one-colour product',
    );
    const three = product({ colors: ['black', 'white', 'red'] });
    const union = anyOf(group(inList('colors', 'black')), group(inList('colors', 'white')));
    assert.deepEqual(partialColorSummary(union as never, three as never).sort(), ['black', 'white']);
  });
});

// ---------------------------------------------------------------------------------------------
// F, G, H: price offers on one item
// ---------------------------------------------------------------------------------------------

describe('F: Percent off', () => {
  it('F1: 10% off 1,000 is 900, with the old price kept and a "10% off" badge', () => {
    const result = price([mk('a', pct(10))]);
    assert.equal(result.listPrice, 1000);
    assert.equal(result.basePrice, 1000);
    assert.equal(result.effectivePrice, 900);
    assert.equal(result.appliedOfferId, 'a');
    assert.equal(result.discountPercent, 10);
    assert.deepEqual(result.badges, [{ offerId: 'a', text: '10% off', partial: false, labelOnly: false }]);
  });

  it('F6: the price is per piece, so 3 pieces are 2,700', () => {
    assert.equal(3 * price([mk('a', pct(10))]).effectivePrice, 2700);
  });

  it('F2: rounds to whole pounds (15% off 999 is 849.15, so 849)', () => {
    const result = price([mk('a', pct(15))], product({ price: 999 }));
    assert.equal(result.effectivePrice, 849);
    assert.equal(result.discountPercent, 15);
  });

  it('F2: rounds halves and fractions to the nearest pound', () => {
    // 25% off 1,001 = 750.75 -> 751
    assert.equal(price([mk('a', pct(25))], product({ price: 1001 })).effectivePrice, 751);
    // 33% off 100 = 67
    assert.equal(price([mk('a', pct(33))], product({ price: 100 })).effectivePrice, 67);
    // 12% off 999 = 879.12 -> 879
    assert.equal(price([mk('a', pct(12))], product({ price: 999 })).effectivePrice, 879);
    // 1% off 100 = 99
    assert.equal(price([mk('a', pct(1))], product({ price: 100 })).effectivePrice, 99);
  });

  it('F3: 100% off is free, and the badge says so', () => {
    const result = price([mk('a', pct(100))]);
    assert.equal(result.effectivePrice, 0);
    assert.equal(result.discountPercent, 100);
    assert.equal(result.badges[0].text, '100% off');
  });

  it('a stored percent above 100 never goes below 0; 0 does nothing', () => {
    assert.equal(price([mk('a', pct(150))]).effectivePrice, 0);
    const zero = price([mk('a', pct(0))]);
    assert.equal(zero.effectivePrice, 1000);
    assert.equal(zero.appliedOfferId, null);
    assert.deepEqual(zero.badges, []);
    assert.equal(price([mk('a', pct(-5))]).effectivePrice, 1000, 'a negative percent never raises the price');
  });

  it('F1: a product with no matching offer shows its normal price and no badge', () => {
    const result = price([mk('a', pct(10), { conditions: only(inList('brandId', 'brand-b')) })]);
    assert.equal(result.effectivePrice, 1000);
    assert.equal(result.appliedOfferId, null);
    assert.deepEqual(result.badges, []);
  });

  it('A6: a badge override replaces "10% off" (trimmed); a blank badge falls back to the percent', () => {
    assert.equal(price([mk('a', pct(10), { badge: 'Black Friday' })]).badges[0].text, 'Black Friday');
    assert.equal(price([mk('a', pct(10), { badge: '  Black Friday  ' })]).badges[0].text, 'Black Friday');
    assert.equal(price([mk('a', pct(10), { badge: '   ' })]).badges[0].text, '10% off');
    assert.equal(price([mk('a', pct(10), { badge: null })]).badges[0].text, '10% off');
    assert.equal(shown([mk('a', pct(10), { badge: 'Black Friday' })]).badges[0].text, 'Black Friday');
  });

  it('prices are rounded to whole pounds before an offer is applied', () => {
    const result = price([mk('a', pct(10))], product({ price: 999.6 }));
    assert.equal(result.basePrice, 1000);
    assert.equal(result.effectivePrice, 900);
  });
});

describe('G: Amount off', () => {
  it('G1: 200 off 1,000 is 800, and the badge shows the percent worked out', () => {
    const result = price([mk('a', amt(200))]);
    assert.equal(result.effectivePrice, 800);
    assert.equal(result.discountPercent, 20);
    assert.equal(result.badges[0].text, '20% off');
  });

  it('G4: the amount comes off each piece, so 2 pieces are 1,600', () => {
    assert.equal(2 * price([mk('a', amt(200))]).effectivePrice, 1600);
  });

  it('G2: an amount bigger than the price makes it free, never negative', () => {
    const result = price([mk('a', amt(1500))]);
    assert.equal(result.effectivePrice, 0);
    assert.equal(result.discountPercent, 100);
    assert.equal(price([mk('a', amt(1000))]).effectivePrice, 0, 'exactly the price');
  });

  it('a fraction of a pound is rounded; 0 does nothing', () => {
    assert.equal(price([mk('a', amt(199.6))]).effectivePrice, 800);
    assert.equal(price([mk('a', amt(0))]).effectivePrice, 1000);
    assert.equal(price([mk('a', amt(-50))]).effectivePrice, 1000, 'a negative amount never raises the price');
  });

  it('G1: the badge percent is rounded from the real saving (EGP 150 off 999 is 15%)', () => {
    const result = price([mk('a', amt(150))], product({ price: 999 }));
    assert.equal(result.effectivePrice, 849);
    assert.equal(result.discountPercent, 15);
  });
});

describe('H: Set price', () => {
  it('H1: a set price below the price replaces it (700, old 1,000), badge 30% off', () => {
    const result = price([mk('a', fixed(700))]);
    assert.equal(result.effectivePrice, 700);
    assert.equal(result.listPrice, 1000);
    assert.equal(result.discountPercent, 30);
    assert.equal(result.badges[0].text, '30% off');
  });

  it('H2: a set price above the price is skipped (stays 1,000, no badge)', () => {
    const result = price([mk('a', fixed(1200))]);
    assert.equal(result.effectivePrice, 1000);
    assert.equal(result.appliedOfferId, null);
    assert.deepEqual(result.badges, []);
  });

  it('H3: a set price equal to the price is skipped, no badge', () => {
    const result = price([mk('a', fixed(1000))]);
    assert.equal(result.effectivePrice, 1000);
    assert.equal(result.appliedOfferId, null);
    assert.deepEqual(result.badges, []);
  });

  it('H4: a set price of 0 makes it free', () => {
    const result = price([mk('a', fixed(0))]);
    assert.equal(result.effectivePrice, 0);
    assert.equal(result.discountPercent, 100);
  });

  it('H5: on a sale product (800, was 1,000) a set price of 700 wins and the old price is struck through', () => {
    const result = price([mk('a', fixed(700))], P2);
    assert.equal(result.effectivePrice, 700);
    assert.equal(result.listPrice, 1000);
    assert.equal(result.discountPercent, 30);
    assert.equal(result.appliedOfferId, 'a');
  });

  it('H5: a set price above the sale price is skipped and the sale stays', () => {
    const result = price([mk('a', fixed(900))], P2);
    assert.equal(result.effectivePrice, 800);
    assert.equal(result.appliedOfferId, null);
    assert.deepEqual(result.badges, [{ offerId: 'sale', text: '20% off', partial: false, labelOnly: false }]);
  });

  it('a set price is compared with the selling price even when the policy is Best discount wins', () => {
    assert.equal(price([mk('a', fixed(850))], P2).effectivePrice, 800);
  });
});

// ---------------------------------------------------------------------------------------------
// I. Products already on sale
// ---------------------------------------------------------------------------------------------

describe('I: products already on sale (P2: 800, was 1,000)', () => {
  it('a sale product with no offer shows the sale badge', () => {
    const result = price([], P2);
    assert.equal(result.effectivePrice, 800);
    assert.equal(result.listPrice, 1000);
    assert.equal(result.discountPercent, 20);
    assert.deepEqual(result.badges, [{ offerId: 'sale', text: '20% off', partial: false, labelOnly: false }]);
    assert.equal(result.appliedOfferId, null);
  });

  it('an old price at or below the price is not a sale', () => {
    for (const compareAtPrice of [1000, 900, 0]) {
      const result = price([], product({ compareAtPrice }));
      assert.equal(result.listPrice, 1000);
      assert.deepEqual(result.badges, []);
    }
  });

  it('I1: Best discount wins, offer better: 30% is taken from the old price (700) and beats 800', () => {
    const result = price([mk('a', pct(30), { saleItems: 'bestOf' })], P2);
    assert.equal(result.effectivePrice, 700);
    assert.equal(result.discountPercent, 30);
    assert.equal(result.appliedOfferId, 'a');
    assert.equal(result.badges[0].text, '30% off');
  });

  it('I1: the same rule for Amount off (300 off the old price)', () => {
    assert.equal(price([mk('a', amt(300))], P2).effectivePrice, 700);
  });

  it('I2: Best discount wins, sale better: 10% of 1,000 is 900, so it stays 800 and shows the sale badge', () => {
    const result = price([mk('a', pct(10))], P2);
    assert.equal(result.effectivePrice, 800);
    assert.equal(result.appliedOfferId, null);
    assert.equal(result.discountPercent, 20);
    assert.deepEqual(result.badges, [{ offerId: 'sale', text: '20% off', partial: false, labelOnly: false }]);
  });

  it('I2: an offer that gives exactly the sale price does not replace it', () => {
    const result = price([mk('a', pct(20))], P2);
    assert.equal(result.effectivePrice, 800);
    assert.equal(result.appliedOfferId, null);
    assert.equal(price([mk('a', amt(200))], P2).appliedOfferId, null);
  });

  it('I2: never both: the offer percent is never added on top of the sale', () => {
    // 30% off 800 would be 560; "both" must never happen.
    assert.notEqual(price([mk('a', pct(30))], P2).effectivePrice, 560);
    assert.notEqual(price([mk('a', pct(30))], P2).effectivePrice, 640);
  });

  it('I3: Skip products already on sale leaves P2 at 800 and still discounts P1', () => {
    const skip = mk('a', pct(30), { saleItems: 'exclude' });
    const sale = price([skip], P2);
    assert.equal(sale.effectivePrice, 800);
    assert.equal(sale.appliedOfferId, null);
    assert.deepEqual(sale.badges, [{ offerId: 'sale', text: '20% off', partial: false, labelOnly: false }]);
    assert.equal(price([skip], P1).effectivePrice, 700);
  });

  it('I3: Skip also applies to Amount off and Set price', () => {
    assert.equal(price([mk('a', amt(300), { saleItems: 'exclude' })], P2).effectivePrice, 800);
    assert.equal(price([mk('a', fixed(500), { saleItems: 'exclude' })], P2).effectivePrice, 800);
  });

  it('I3: a Skip offer does not block another offer that allows sale items', () => {
    const skip = mk('skip', pct(50), { saleItems: 'exclude' });
    const best = mk('best', pct(30));
    const result = price([skip, best], P2);
    assert.equal(result.effectivePrice, 700);
    assert.equal(result.appliedOfferId, 'best');
  });

  it('I3: Skip leaves its label (Buy X Get Y) off sale products, and on for full-price ones', () => {
    const skipDeal = mk('deal', BXGY, { saleItems: 'exclude' });
    assert.deepEqual(
      price([skipDeal], P2).badges.map((b: Obj) => b.text),
      ['20% off'],
    );
    assert.deepEqual(
      price([skipDeal], P1).badges.map((b: Obj) => b.text),
      ['Buy 2, get 1 free'],
    );
  });

  it('I6: the Shop Sale filter includes an offer product (see the search record section)', () => {
    // The card price drops below the price for a plain full-price product.
    assert.equal(shown([mk('a', pct(10))], P1).fromPrice, 900);
  });
});

// ---------------------------------------------------------------------------------------------
// O. Two or more offers at once on one item
// ---------------------------------------------------------------------------------------------

describe('O: the cheaper price wins; never two price offers on one item', () => {
  const both = (a: Obj, b: Obj, p: Obj = P1, ctx: Obj = VISITOR) => [
    price([a, b], p, null, ctx),
    price([b, a], p, null, ctx),
  ];

  it('O1: 10% and 20% on P1: 800 with the 20% offer, in either order, never both', () => {
    for (const result of both(mk('A', pct(10)), mk('B', pct(20)))) {
      assert.equal(result.effectivePrice, 800);
      assert.equal(result.appliedOfferId, 'B');
      assert.equal(result.badges[0].text, '20% off');
      assert.equal(result.badges.length, 1);
    }
  });

  it('O2: same price, the higher priority wins (A has priority 10), in either order', () => {
    const a = mk('A', pct(10), { priority: 10, badge: 'Offer A' });
    const b = mk('B', pct(10), { priority: 0, badge: 'Offer B' });
    for (const result of both(a, b)) {
      assert.equal(result.effectivePrice, 900);
      assert.equal(result.appliedOfferId, 'A');
      assert.equal(result.badges[0].text, 'Offer A');
    }
  });

  it('O2: a negative priority loses to priority 0', () => {
    for (const result of both(mk('A', pct(10), { priority: -5 }), mk('B', pct(10)))) {
      assert.equal(result.appliedOfferId, 'B');
    }
  });

  it('O2: a better price beats a higher priority', () => {
    for (const result of both(mk('A', pct(10), { priority: 100 }), mk('B', pct(20), { priority: -100 }))) {
      assert.equal(result.effectivePrice, 800);
      assert.equal(result.appliedOfferId, 'B');
    }
  });

  it('O3: same price and same priority, the most recently edited offer wins, in either order', () => {
    const older = mk('A', pct(10), { updatedAtMs: 1_000 });
    const newer = mk('B', pct(10), { updatedAtMs: 2_000 });
    for (const result of both(older, newer)) assert.equal(result.appliedOfferId, 'B');
  });

  it('O3: an offer with an edit time beats one with none', () => {
    for (const result of both(mk('A', pct(10)), mk('B', pct(10), { updatedAtMs: 5 }))) {
      assert.equal(result.appliedOfferId, 'B');
    }
  });

  it('O3: priority is looked at before the edit time', () => {
    const highPriorityOld = mk('A', pct(10), { priority: 1, updatedAtMs: 1 });
    const lowPriorityNew = mk('B', pct(10), { priority: 0, updatedAtMs: 9_999 });
    for (const result of both(highPriorityOld, lowPriorityNew)) assert.equal(result.appliedOfferId, 'A');
  });

  it('O4: 10% (900) and 200 off (800): 800 from the amount offer', () => {
    for (const result of both(mk('A', pct(10)), mk('B', amt(200)))) {
      assert.equal(result.effectivePrice, 800);
      assert.equal(result.appliedOfferId, 'B');
    }
  });

  it('O5: 10% (900) and a set price of 950: 900 from the percent offer', () => {
    for (const result of both(mk('A', pct(10)), mk('B', fixed(950)))) {
      assert.equal(result.effectivePrice, 900);
      assert.equal(result.appliedOfferId, 'A');
    }
  });

  it('O5: all three price types together: the lowest of 900, 850 and 800 wins', () => {
    const result = price([mk('A', pct(10)), mk('B', amt(150)), mk('C', fixed(800))]);
    assert.equal(result.effectivePrice, 800);
    assert.equal(result.appliedOfferId, 'C');
  });

  it('O6: everyone 10% and signed-in-only 20%: visitor 900, shopper 800', () => {
    const everyone = mk('A', pct(10));
    const members = mk('B', pct(20), { audience: 'signedIn' });
    assert.equal(price([everyone, members], P1, null, VISITOR).effectivePrice, 900);
    assert.equal(price([everyone, members], P1, null, VISITOR).appliedOfferId, 'A');
    assert.equal(price([everyone, members], P1, null, SHOPPER).effectivePrice, 800);
    assert.equal(price([everyone, members], P1, null, SHOPPER).appliedOfferId, 'B');
  });

  it('O7: the cheaper offer is paused (or archived, or over): the other one applies', () => {
    const live = mk('B', pct(10));
    for (const off of [
      mk('A', pct(20), { active: false }),
      mk('A', pct(20), { archived: true }),
      mk('A', pct(20), { schedule: schedule(null, ms(-1)) }),
      mk('A', pct(20), { schedule: schedule(ms(1), null) }),
    ]) {
      const result = price([off, live]);
      assert.equal(result.effectivePrice, 900);
      assert.equal(result.appliedOfferId, 'B');
    }
  });

  it('O8: 10% on size M and 20% on size L: M is 900, L is 800, S is 1,000', () => {
    const tee = product({ sizes: ['S', 'M', 'L'] });
    const a = mk('A', pct(10), { conditions: only(inList('sizes', 'M')) });
    const b = mk('B', pct(20), { conditions: only(inList('sizes', 'L')) });
    assert.equal(price([a, b], tee, { id: 'm', size: 'M' }).effectivePrice, 900);
    assert.equal(price([a, b], tee, { id: 'l', size: 'L' }).effectivePrice, 800);
    assert.equal(price([a, b], tee, { id: 's', size: 'S' }).effectivePrice, 1000);
    assert.equal(price([a, b], tee, { id: 'm', size: 'M' }).appliedOfferId, 'A');
  });

  it('O8: the card shows "From 800" and a partial price', () => {
    const tee = product({ sizes: ['S', 'M', 'L'] });
    const a = mk('A', pct(10), { conditions: only(inList('sizes', 'M')) });
    const b = mk('B', pct(20), { conditions: only(inList('sizes', 'L')) });
    const card = shown([a, b], tee);
    assert.equal(card.fromPrice, 800);
    assert.equal(card.partial, true);
    assert.equal(card.listPrice, 1000);
    assert.equal(card.maxDiscountPercent, 20);
  });

  it('E1: an offer that matches only one of two products does not leak onto the other', () => {
    const brandA = mk('A', pct(20), { conditions: only(inList('brandId', 'brand-a')) });
    assert.equal(price([brandA], P1).effectivePrice, 800);
    assert.equal(price([brandA], P4).effectivePrice, 150);
  });

  it('the Buy X Get Y, free gift and free shipping offers never change the item price', () => {
    for (const reward of [BXGY, GIFT, SHIP]) {
      const result = price([mk('a', reward)]);
      assert.equal(result.effectivePrice, 1000);
      assert.equal(result.appliedOfferId, null);
    }
  });

  it('a free gift or free shipping can come on top of a price offer', () => {
    const result = price([mk('A', pct(10)), mk('G', GIFT), mk('S', SHIP)]);
    assert.equal(result.effectivePrice, 900);
    assert.equal(result.appliedOfferId, 'A');
    assert.deepEqual(
      result.badges.map((b: Obj) => b.offerId),
      ['A', 'G', 'S'],
    );
  });
});

describe('O13: badges (at most 3, no repeats)', () => {
  it('O13: percent off + Buy X Get Y + Free shipping shows all three, price badge first', () => {
    const result = price([mk('A', pct(10)), mk('B', BXGY), mk('S', SHIP)]);
    assert.deepEqual(
      result.badges.map((b: Obj) => b.text),
      ['10% off', 'Buy 2, get 1 free', 'Free shipping'],
    );
    assert.deepEqual(
      result.badges.map((b: Obj) => b.labelOnly),
      [false, true, true],
    );
  });

  it('O13: a fourth offer never adds a fourth badge', () => {
    const result = price([mk('A', pct(10)), mk('B', BXGY), mk('S', SHIP), mk('G', GIFT)]);
    assert.equal(result.badges.length, 3);
    assert.deepEqual(
      result.badges.map((b: Obj) => b.text),
      ['10% off', 'Buy 2, get 1 free', 'Free shipping'],
    );
    assert.equal(shown([mk('A', pct(10)), mk('B', BXGY), mk('S', SHIP), mk('G', GIFT)]).badges.length, 3);
  });

  it('O13: the price badge takes the first spot even when label offers come first in the list', () => {
    const result = price([mk('S', SHIP), mk('B', BXGY), mk('G', GIFT), mk('A', pct(10))]);
    assert.equal(result.badges[0].text, '10% off');
    assert.equal(result.badges.length, 3);
  });

  it('O13: the same label from two offers shows once', () => {
    const result = price([mk('B1', BXGY), mk('B2', BXGY), mk('S1', SHIP), mk('S2', SHIP)]);
    assert.deepEqual(
      result.badges.map((b: Obj) => b.text),
      ['Buy 2, get 1 free', 'Free shipping'],
    );
  });

  it('O13: two different Buy X Get Y offers show two labels', () => {
    const second = { ...BXGY, buy: { quantity: 3 }, get: { quantity: 2, percent: 50 } };
    const result = price([mk('B1', BXGY), mk('B2', second)]);
    assert.deepEqual(
      result.badges.map((b: Obj) => b.text),
      ['Buy 2, get 1 free', 'Buy 3, get 2 at 50% off'],
    );
  });

  it('a sale product shows the sale badge first, then the labels', () => {
    const result = price([mk('B', BXGY), mk('S', SHIP)], P2);
    assert.deepEqual(
      result.badges.map((b: Obj) => b.text),
      ['20% off', 'Buy 2, get 1 free', 'Free shipping'],
    );
  });

  it('a free gift offer has a label badge flagged as label-only (the product page hides it)', () => {
    const badge = price([mk('G', GIFT)]).badges[0];
    assert.equal(badge.text, 'Free gift');
    assert.equal(badge.labelOnly, true);
  });

  it('a custom badge also works on label offers', () => {
    assert.equal(price([mk('B', BXGY, { badge: 'Bundle' })]).badges[0].text, 'Bundle');
  });

  it('displayPrice never returns more than 3 badges', () => {
    const offers = [mk('A', pct(10)), mk('B', BXGY), mk('S', SHIP), mk('G', GIFT)];
    assert.ok(shown(offers).badges.length <= 3);
  });
});

// ---------------------------------------------------------------------------------------------
// displayPrice (cards, search, product page "From")
// ---------------------------------------------------------------------------------------------

describe('displayPrice: From price and partial offers', () => {
  const tee = product({ sizes: ['S', 'M', 'L'] });
  const twoColour = product({ productId: 'p5', name: 'P5', colors: ['black', 'white'] });

  it('no offer, no variants: the normal price, nothing partial', () => {
    const card = shown([], P1);
    assert.equal(card.fromPrice, 1000);
    assert.equal(card.listPrice, 1000);
    assert.equal(card.maxDiscountPercent, 0);
    assert.equal(card.partial, false);
    assert.deepEqual(card.badges, []);
    assert.deepEqual(card.offerIds, []);
  });

  it('a sale product: from 800, was 1,000, sale badge, 20% max', () => {
    const card = shown([], P2);
    assert.equal(card.fromPrice, 800);
    assert.equal(card.listPrice, 1000);
    assert.equal(card.maxDiscountPercent, 20);
    assert.deepEqual(card.badges, [{ offerId: 'sale', text: '20% off', partial: false, labelOnly: false }]);
  });

  it('a whole-product offer is not partial, even with several sizes', () => {
    const card = shown([mk('a', pct(10))], tee);
    assert.equal(card.fromPrice, 900);
    assert.equal(card.partial, false);
    assert.equal(card.maxDiscountPercent, 10);
  });

  it('E8: an offer on size M only gives "From 900" and a partial price', () => {
    const card = shown([mk('a', pct(10), { conditions: only(inList('sizes', 'M')) })], tee);
    assert.equal(card.fromPrice, 900);
    assert.equal(card.listPrice, 1000);
    assert.equal(card.partial, true);
    assert.equal(card.maxDiscountPercent, 10);
    assert.deepEqual(
      card.badges.map((b: Obj) => ({ text: b.text, partial: b.partial })),
      [{ text: '10% off', partial: true }],
    );
  });

  it('E8: choosing sizes: M is 900 and L is 1,000', () => {
    const offer = mk('a', pct(10), { conditions: only(inList('sizes', 'M')) });
    assert.equal(price([offer], tee, { id: 'm', size: 'M' }).effectivePrice, 900);
    assert.equal(price([offer], tee, { id: 'l', size: 'L' }).effectivePrice, 1000);
    assert.equal(price([offer], tee, { id: 'l', size: 'L' }).appliedOfferId, null);
  });

  it('E9: a colour offer on a two-colour product: "10% off · Black only", From 900, partial', () => {
    const card = shown([mk('a', pct(10), { conditions: only(inList('colors', 'black')) })], twoColour);
    assert.equal(card.fromPrice, 900);
    assert.equal(card.partial, true);
    assert.equal(card.badges[0].text, '10% off · Black only');
    assert.equal(card.badges[0].partial, true);
  });

  it('E9: only black is discounted at variant level', () => {
    const offer = mk('a', pct(10), { conditions: only(inList('colors', 'black')) });
    assert.equal(price([offer], twoColour, { id: 'b', color: 'black' }).effectivePrice, 900);
    assert.equal(price([offer], twoColour, { id: 'w', color: 'white' }).effectivePrice, 1000);
    assert.equal(price([offer], twoColour, { id: 'b', color: 'black' }).badges[0].text, '10% off');
  });

  it('E9: two of three colours match: still partial, but no single colour to name', () => {
    const three = product({ colors: ['black', 'white', 'red'] });
    const card = shown([mk('a', pct(10), { conditions: only(inList('colors', 'black', 'white')) })], three);
    assert.equal(card.fromPrice, 900);
    assert.equal(card.partial, true);
    assert.equal(card.badges[0].text, '10% off');
  });

  it('E9: every colour matched is a normal, non-partial price', () => {
    const card = shown(
      [mk('a', pct(10), { conditions: only(inList('colors', 'black', 'white')) })],
      twoColour,
    );
    assert.equal(card.fromPrice, 900);
    assert.equal(card.partial, false);
    assert.equal(card.badges[0].text, '10% off');
  });

  it('E9: with real variants, only the black ones are discounted', () => {
    const withVariants = product({
      colors: ['black', 'white'],
      sizes: ['M', 'L'],
      variants: [
        { id: 'v1', color: 'black', size: 'M' },
        { id: 'v2', color: 'black', size: 'L' },
        { id: 'v3', color: 'white', size: 'M' },
      ],
    });
    const card = shown([mk('a', pct(10), { conditions: only(inList('colors', 'black')) })], withVariants);
    assert.equal(card.fromPrice, 900);
    assert.equal(card.partial, true);
  });

  it('E16: Except black on a two-colour product: white is 900, black 1,000, From 900', () => {
    const offer = mk('a', pct(10), { exclude: only(inList('colors', 'black')) });
    assert.equal(price([offer], twoColour, { id: 'w', color: 'white' }).effectivePrice, 900);
    assert.equal(price([offer], twoColour, { id: 'b', color: 'black' }).effectivePrice, 1000);
    const card = shown([offer], twoColour);
    assert.equal(card.fromPrice, 900);
    assert.equal(card.partial, true);
  });

  it('a partial offer that changes no price (free shipping on one size) adds no "From"', () => {
    const card = shown([mk('s', SHIP, { conditions: only(inList('sizes', 'M')) })], tee);
    assert.equal(card.partial, false);
    assert.equal(card.fromPrice, 1000);
    assert.deepEqual(card.offerIds, ['s']);
  });

  it('an offer beaten on every size by a better one adds no "From"', () => {
    const small = mk('a', pct(10), { conditions: only(inList('sizes', 'M')) });
    const big = mk('b', pct(20));
    const card = shown([small, big], tee);
    assert.equal(card.fromPrice, 800);
    assert.equal(card.partial, false);
  });

  it('maxDiscountPercent counts from the old price (30% off a 1,000 old price on P2 is 30)', () => {
    const card = shown([mk('a', pct(30))], P2);
    assert.equal(card.fromPrice, 700);
    assert.equal(card.maxDiscountPercent, 30);
  });

  it('offerIds lists every live offer the product is in, even ones another offer beat', () => {
    const offers = [mk('a', pct(10)), mk('b', pct(20)), mk('c', BXGY), mk('d', SHIP), mk('e', GIFT)];
    assert.deepEqual(shown(offers).offerIds.slice().sort(), ['a', 'b', 'c', 'd', 'e']);
  });

  it('offerIds leaves out offers that do not match, are not live, or are for signed-in shoppers only', () => {
    const offers = [
      mk('match', pct(10)),
      mk('other-brand', pct(10), { conditions: only(inList('brandId', 'brand-b')) }),
      mk('paused', pct(10), { active: false }),
      mk('members', pct(10), { audience: 'signedIn' }),
    ];
    assert.deepEqual(shown(offers, P1, VISITOR).offerIds, ['match']);
    assert.deepEqual(shown(offers, P1, SHOPPER).offerIds.slice().sort(), ['match', 'members']);
  });

  it('offerIds leaves out an offer that skips sale items when the product is on sale', () => {
    const offers = [
      mk('skip', pct(30), { saleItems: 'exclude' }),
      mk('skipGift', GIFT, { saleItems: 'exclude' }),
      mk('best', pct(30)),
    ];
    assert.deepEqual(shown(offers, P2).offerIds, ['best']);
    assert.deepEqual(shown(offers, P1).offerIds.slice().sort(), ['best', 'skip', 'skipGift']);
  });

  it('offerIds has no repeats', () => {
    const tee2 = product({ sizes: ['S', 'M'] });
    const card = shown([mk('a', pct(10))], tee2);
    assert.deepEqual(card.offerIds, ['a']);
  });
});

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

describe('labels: describeOfferReward and badges', () => {
  const describeIt = (reward: Obj, over: Obj = {}) => describeOfferReward(mk('a', reward, over) as never);

  it('describes each deal type in plain words', () => {
    assert.equal(describeIt(pct(10)), '10% off');
    assert.equal(describeIt(amt(1500)), 'EGP 1,500 off');
    assert.equal(describeIt(amt(200)), 'EGP 200 off');
    assert.equal(describeIt(fixed(1200)), 'Set price EGP 1,200');
    assert.equal(describeIt(SHIP), 'Free shipping');
    assert.equal(describeIt(BXGY), 'Buy 2, get 1 free');
    assert.equal(
      describeIt({ ...BXGY, buy: { quantity: 3 }, get: { quantity: 2, percent: 50 } }),
      'Buy 3, get 2 at 50% off',
    );
  });

  it('describes free gifts by their names, joined with +', () => {
    assert.equal(describeIt(GIFT), 'Free shirt');
    assert.equal(
      describeIt({
        kind: 'freeGift',
        gifts: [
          { id: 'g1', name: 'Free shirt', productIds: ['p3'] },
          { id: 'g2', name: 'Free socks', productIds: ['p3'] },
        ],
      }),
      'Free shirt + Free socks',
    );
    assert.equal(describeIt({ kind: 'freeGift', gifts: [] }), 'Free gift');
  });

  it('formatAppliedOfferBadge uses the custom badge, then the percent, then the title', () => {
    const offer = mk('a', pct(10), { title: 'Summer deal' });
    assert.equal(formatAppliedOfferBadge(offer as never, 10, P1 as never, false).text, '10% off');
    assert.equal(formatAppliedOfferBadge(offer as never, 0, P1 as never, false).text, 'Summer deal');
    assert.equal(
      formatAppliedOfferBadge({ ...offer, badge: ' Hot ' } as never, 10, P1 as never, false).text,
      'Hot',
    );
  });

  it('a partial colour match names the colour only when exactly one is picked', () => {
    const p5 = product({ colors: ['black', 'white'] });
    const offer = mk('a', pct(10), { conditions: only(inList('colors', 'light-blue')) });
    const lightBlue = product({ colors: ['light-blue', 'white'] });
    assert.equal(
      formatAppliedOfferBadge(offer as never, 10, lightBlue as never, true).text,
      '10% off · Light blue only',
    );
    const black = mk('a', pct(10), { conditions: only(inList('colors', 'black')) });
    assert.equal(formatAppliedOfferBadge(black as never, 10, p5 as never, true).text, '10% off · Black only');
    assert.equal(formatAppliedOfferBadge(black as never, 10, p5 as never, false).text, '10% off');
  });

  it('a Set price offer has no label of its own when it is skipped', () => {
    assert.equal(formatLabelOnlyOfferBadge(mk('a', fixed(1200)) as never, P1 as never, false), null);
    assert.equal(
      formatLabelOnlyOfferBadge(mk('a', SHIP) as never, P1 as never, false)?.text,
      'Free shipping',
    );
    assert.equal(formatLabelOnlyOfferBadge(mk('a', SHIP) as never, P1 as never, false)?.labelOnly, true);
  });
});

// ---------------------------------------------------------------------------------------------
// Search records (Shop Sale filter, price sort, signed-in offers on cards)
// ---------------------------------------------------------------------------------------------

describe('search record: card prices, Sale filter and sort', () => {
  const racket = (over: Obj = {}): Obj => ({
    published: true,
    name: 'Head Speed Pro',
    slug: 'head-speed-pro',
    brandId: 'head',
    type: 'racket',
    categoryIds: ['padel', 'rackets'],
    categoryId: 'rackets',
    price: 1000,
    compareAtPrice: null,
    ...over,
  });
  const record = (offers: Obj[], data: Obj = racket(), now: Date = NOW) => {
    const result = toSearchRecord('racket-1', data, new Map(), new Map(), offers as never, now);
    assert.ok(result, 'record is built');
    return result as Obj;
  };

  it('Q2: the card price is the offer price, so sorting by price uses it', () => {
    const expensive = record(
      [mk('half', pct(50), { conditions: only(inList('productId', 'big')) })],
      racket({ price: 2000 }),
    );
    const offers = [mk('half', pct(50))];
    const big = toSearchRecord(
      'big',
      racket({ price: 2000 }),
      new Map(),
      new Map(),
      offers as never,
      NOW,
    ) as Obj;
    const middle = toSearchRecord(
      'mid',
      racket({ price: 1500, slug: 'mid', name: 'Mid' }),
      new Map(),
      new Map(),
      [] as never,
      NOW,
    ) as Obj;
    assert.equal(expensive.displayPrice, 2000, 'an offer on another product changes nothing');
    assert.equal(big.displayPrice, 1000);
    assert.equal(big.price, 2000);
    assert.equal(big.listPrice, 2000);
    assert.equal(big.maxDiscountPercent, 50);
    assert.ok(big.displayPrice < middle.displayPrice, 'sorted by its offer price: 1,000 before 1,500');
  });

  it('Q2: after the offer ends (the 15-minute refresh) the card price goes back to normal', () => {
    const offer = mk('half', pct(50), { schedule: schedule(null, ms(10 * MIN)) });
    assert.equal(
      computeProductOfferFields('r', racket({ price: 2000 }), [offer] as never, NOW).displayPrice,
      1000,
    );
    assert.equal(
      computeProductOfferFields('r', racket({ price: 2000 }), [offer] as never, ms(10 * MIN)).displayPrice,
      2000,
    );
  });

  it('Q2: a scheduled offer starts on the first refresh after its start', () => {
    const offer = mk('half', pct(50), { schedule: schedule(ms(10 * MIN), null) });
    assert.equal(
      computeProductOfferFields('r', racket({ price: 2000 }), [offer] as never, NOW).displayPrice,
      2000,
    );
    assert.equal(
      computeProductOfferFields('r', racket({ price: 2000 }), [offer] as never, ms(10 * MIN)).displayPrice,
      1000,
    );
  });

  it('D5: a signed-in-only offer never shows on cards (they are priced for visitors)', () => {
    const offer = mk('members', pct(20), { audience: 'signedIn' });
    const result = record([offer]);
    assert.equal(result.displayPrice, 1000);
    assert.equal(result.hasOffer, false);
    assert.deepEqual(result.offerIds, []);
    assert.deepEqual(result.offerBadges, []);
    assert.equal(result.onSale, false);
    // The product page, once the shopper is signed in, does show it.
    const page = shown([offer], product({ price: 1000, productId: 'racket-1', brandId: 'head' }), SHOPPER);
    assert.equal(page.fromPrice, 800);
  });

  it('D5: a public offer next to a signed-in-only one: the card shows only the public price', () => {
    const result = record([mk('all', pct(10)), mk('members', pct(30), { audience: 'signedIn' })]);
    assert.equal(result.displayPrice, 900);
    assert.deepEqual(result.offerIds, ['all']);
    assert.deepEqual(result.offerBadges, ['10% off']);
  });

  it('rule 10: a live public price offer puts the product in Sale (Percent off, Amount off, Set price)', () => {
    for (const reward of [pct(10), amt(100), fixed(900)]) {
      const result = record([mk('o', reward)]);
      assert.equal(result.displayPrice, 900);
      assert.equal(result.onSale, true, reward.kind);
      assert.equal(result.discountPercent, 0, 'the old-price percent only counts a compare-at price');
    }
  });

  it('rule 10: Skip-sale offers still put a full-price product in Sale', () => {
    assert.equal(record([mk('o', pct(10), { saleItems: 'exclude' })]).onSale, true);
  });

  it('rule 10: a size-only price offer lowers the "From" price, so it counts', () => {
    const data = racket({
      options: [{ key: 'size', values: [{ label: 'S' }, { label: 'M' }, { label: 'L' }] }],
    });
    const result = record([mk('o', pct(10), { conditions: only(inList('sizes', 'M')) })], data);
    assert.equal(result.displayPrice, 900);
    assert.equal(result.pricePartial, true);
    assert.equal(result.onSale, true);
  });

  it('rule 10: a price offer that cannot lower the price (set price above it) is not a sale', () => {
    const result = record([mk('o', fixed(1200))]);
    assert.equal(result.displayPrice, 1000);
    assert.equal(result.onSale, false);
  });

  it('rule 10: Buy X Get Y, Free gift and Free shipping alone are never a sale', () => {
    assert.equal(record([mk('b', BXGY)]).onSale, false);
    assert.equal(record([mk('g', GIFT)]).onSale, false);
    assert.equal(record([mk('s', SHIP)]).onSale, false);
    assert.equal(record([mk('b', BXGY), mk('g', GIFT), mk('s', SHIP)]).onSale, false);
  });

  it('rule 10: next to a price offer they do not matter', () => {
    assert.equal(record([mk('b', BXGY), mk('o', pct(10))]).onSale, true);
  });

  it('rule 10: a paused price offer next to a live Buy X Get Y is not a sale', () => {
    assert.equal(record([mk('o', pct(10), { active: false }), mk('b', BXGY)]).onSale, false);
  });

  it('rule 10: an old price still counts, and so does a sale product with an offer that cannot beat it', () => {
    const sale = racket({ price: 800, compareAtPrice: 1000 });
    assert.equal(record([], sale).onSale, true);
    const weaker = record([mk('o', pct(10))], sale);
    assert.equal(weaker.displayPrice, 800);
    assert.equal(weaker.onSale, true);
    assert.equal(weaker.discountPercent, 20);
  });

  it('rule 10: an offer on other products does not put this one in Sale', () => {
    const other = mk('o', pct(10), { conditions: only(inList('brandId', 'nox')) });
    assert.equal(record([other]).onSale, false);
    assert.equal(record([mk('o', pct(10), { exclude: only(inList('brandId', 'head')) })]).onSale, false);
  });

  it('the offer refresh and a full record agree on every offer field', () => {
    const offers = [
      mk('a', pct(10)),
      mk('b', BXGY),
      mk('c', SHIP),
      mk('m', pct(40), { audience: 'signedIn' }),
    ];
    const fields = computeProductOfferFields('racket-1', racket(), offers as never, NOW);
    const full = record(offers);
    for (const key of [
      'listPrice',
      'displayPrice',
      'hasOffer',
      'offerIds',
      'offerBadges',
      'maxDiscountPercent',
      'pricePartial',
      'onSale',
    ]) {
      assert.deepEqual(full[key], (fields as Obj)[key], key);
    }
    assert.equal(full.hasOffer, true);
    assert.deepEqual(full.offerBadges, ['10% off', 'Buy 2, get 1 free', 'Free shipping']);
  });
});

describe('F7: abroad shoppers see the discounted price in their currency', () => {
  const usd = { code: 'USD', factor: 0.0213 };

  it('F7: the offer price is worked out in EGP first, then converted and rounded up', () => {
    const offerPrice = price([mk('a', pct(10))]).effectivePrice;
    assert.equal(offerPrice, 900);
    // 900 x 0.0213 = 19.17, rounded up to the next whole dollar; the old price 1,000 shows as 22.
    assert.equal(toDisplayAmount(offerPrice, usd), 20);
    assert.equal(toDisplayAmount(1000, usd), 22);
    assert.ok(toDisplayAmount(offerPrice, usd) < toDisplayAmount(1000, usd));
  });

  it('F7: EGP is never converted, and rounding goes up in a clean step', () => {
    assert.equal(toDisplayAmount(900, { code: 'EGP', factor: 1 }), 900);
    assert.equal(toDisplayAmount(900, { code: 'USD', factor: 0.02 }), 18, 'already a clean amount');
    assert.equal(toDisplayAmount(1000, { code: 'USD', factor: 0.503 }), 505, 'steps of 5 near 1.5%');
    assert.equal(toDisplayAmount(900, { code: 'KWD', factor: 0.006 }), 5.4, 'three decimals currencies');
  });

  it('F7: a free item stays free, and bad rates never break a price', () => {
    assert.equal(toDisplayAmount(0, { code: 'USD', factor: 0.02 }), 0);
    assert.equal(toDisplayAmount(900, { code: 'USD', factor: 0 }), 900);
    assert.equal(toDisplayAmount(Number.NaN, usd), 0);
  });
});
