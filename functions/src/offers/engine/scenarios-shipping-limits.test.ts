import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
// Runs against the compiled code (lib is built from the current sources).
import {
  liveOffers,
  parcelWeight,
  planDelivery,
  priceBagDeals,
  priceItem,
  shippingQuote,
} from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';
import {
  OFFER_LIMIT_ACTOR,
  confirmedEndedOfferIds,
  isLastOfferUse,
  offerFullError,
  offerFullReason,
  offerUseFits,
  readOfferUses,
  releaseOfferUses,
} from '../../../lib/orders/offer-usage.js';
import {
  addUsedOffer,
  dealChangedError,
  freeShippingOfferIdOf,
  missedBasePrice,
  missedDealError,
  missedDealOfferId,
  missedLinePrice,
  missedOrderTotal,
  priceChangedError,
  priceWithFreshOffersOnMiss,
  totalChangedError,
} from '../../../lib/orders/order-pricing.server.js';
import { parseShownAmountEgp } from '../../../lib/orders/order-request.js';

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const CHANGED = 'Prices in your bag changed. Check your bag and place your order again.';

/** Client's Egypt rates (Nov 2026): up to 1 kg = 115, up to 3 kg = 135, heavier = agreed. */
const EGYPT = [
  {
    id: 'box1',
    name: 'Box 1',
    maxWeightGrams: 1_000,
    maxLengthCm: 30,
    maxWidthCm: 20,
    maxHeightCm: 10,
    feeEgp: 115,
  },
  {
    id: 'box2',
    name: 'Box 2',
    maxWeightGrams: 3_000,
    maxLengthCm: 45,
    maxWidthCm: 35,
    maxHeightCm: 20,
    feeEgp: 135,
  },
];
const ABROAD = [
  {
    id: 'box1',
    name: 'Box 1',
    maxWeightGrams: 2_000,
    maxLengthCm: 40,
    maxWidthCm: 30,
    maxHeightCm: 15,
    feeEgp: 1_800,
  },
];
const NO_PROMO = { active: false, fee: 0, startsAt: null, endsAt: null, minSubtotal: null, banner: null };
const SETTINGS = {
  currency: 'EGP',
  egyptBoxes: EGYPT,
  internationalBoxes: ABROAD,
  freeOver: { active: false, threshold: null },
  promo: NO_PROMO,
  note: '',
};

const NOW = new Date('2026-11-10T12:00:00Z');
const CTX = { now: NOW, signedIn: true, codes: [] };
const VISITOR = { now: NOW, signedIn: false, codes: [] };

function tee(overrides = {}) {
  return {
    productId: 'tee-1',
    brandId: 'adidas',
    categoryIds: ['apparel', 't-shirts'],
    type: '',
    modelGroup: null,
    colors: ['black'],
    sizes: [],
    tags: [],
    price: 1_000,
    name: 'Tee',
    compareAtPrice: null,
    ...overrides,
  };
}

function offer(overrides = {}) {
  return {
    id: 'free-ship',
    name: 'Free shipping',
    title: 'Free shipping',
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
    scope: 'cart',
    conditions: { anyOf: [] },
    exclude: { anyOf: [] },
    minimum: null,
    reward: { kind: 'freeShipping' },
    limits: { totalUses: null, perCustomer: null },
    requiresCode: false,
    ...overrides,
  };
}

function quote({
  region = 'egypt',
  subtotal = 1_000,
  weight = 250,
  offers = [],
  settings = SETTINGS,
  lines = [tee()],
  ctx = CTX,
} = {}) {
  return shippingQuote(
    settings,
    {
      region,
      totalWeightGrams: weight,
      goodsSubtotal: subtotal,
      lines: lines.map((product) => ({ product, variant: null })),
    },
    offers,
    ctx,
  );
}

const withPromo = (promo) => ({ ...SETTINGS, promo: { ...NO_PROMO, active: true, ...promo } });
const withFreeOver = (threshold, active = true) => ({ ...SETTINGS, freeOver: { active, threshold } });

/** Percent off / Buy X Get Y through the real parser, as the server reads them. */
function parsed(id, data) {
  const result = parseOfferDoc(id, {
    name: id,
    title: data.title ?? id,
    active: true,
    scope: 'item',
    ...data,
  });
  assert.ok(result, `offer ${id} should parse`);
  return result;
}

/** In-memory stand-in for the few Firestore calls the offer-usage helpers make. */
function fakeDb(docs) {
  const store = new Map(Object.entries(docs).map(([path, data]) => [path, { ...data }]));
  const writes = [];
  const ref = (path) => ({ path });
  const snap = (path) => ({ exists: store.has(path), data: () => store.get(path) });
  const tx = {
    get: async (r) => snap(r.path),
    set: (r, data) => {
      writes.push({ op: 'set', path: r.path, data });
      store.set(r.path, { ...(store.get(r.path) ?? {}), ...data });
    },
    update: (r, data) => {
      if (!store.has(r.path)) throw new Error(`no doc ${r.path}`);
      writes.push({ op: 'update', path: r.path, data });
      store.set(r.path, { ...store.get(r.path), ...data });
    },
  };
  const db = {
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    runTransaction: async (fn) => fn(tx),
  };
  return { db, tx, store, writes };
}

const used = (id, title, limits, kind = 'item') => ({ offerId: id, title, limits, kind });

// ---------------------------------------------------------------------------------------------
// M1-M12 Free shipping (Egypt only, after discounts, conditions, tie order)
// ---------------------------------------------------------------------------------------------

describe('M1 free shipping with no minimum', () => {
  it('makes an Egypt order free and names the offer', () => {
    const result = quote({ offers: [offer()] });
    assert.equal(result.fee, 0);
    assert.equal(result.reason, 'offer');
    assert.equal(result.offerId, 'free-ship');
    assert.equal(result.box.feeEgp, 115);
  });

  it('keeps the box fee when there is no offer', () => {
    const result = quote();
    assert.equal(result.fee, 115);
    assert.equal(result.reason, 'box');
    assert.equal(result.offerId, undefined);
  });

  it('the bigger box fee (135) is also made free', () => {
    const result = quote({ weight: 2_500, offers: [offer()] });
    assert.equal(result.box.id, 'box2');
    assert.equal(result.fee, 0);
  });
});

describe('M2 and M3 minimum 3,000 (inclusive)', () => {
  const minimum3000 = offer({ minimum: { subtotal: 3_000 } });

  it('2,999 pays the box fee', () => {
    const result = quote({ subtotal: 2_999, offers: [minimum3000] });
    assert.equal(result.fee, 115);
    assert.equal(result.reason, 'box');
  });

  it('exactly 3,000 is free', () => {
    const result = quote({ subtotal: 3_000, offers: [minimum3000] });
    assert.equal(result.fee, 0);
    assert.equal(result.reason, 'offer');
  });

  it('3,001 is free', () => {
    assert.equal(quote({ subtotal: 3_001, offers: [minimum3000] }).fee, 0);
  });

  it('a minimum of 0 behaves like no minimum', () => {
    assert.equal(quote({ subtotal: 0, offers: [offer({ minimum: { subtotal: 0 } })] }).fee, 0);
  });
});

describe('M4 the minimum counts the subtotal after item offers', () => {
  const dealOffer = parsed('b2g1', {
    title: 'Buy 2, get 1 free',
    conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
    reward: {
      kind: 'buyXGetY',
      buy: { quantity: 2 },
      get: { quantity: 1, percent: 100 },
      getConditions: null,
      cheapestFree: true,
      repeat: true,
      maxApplications: null,
    },
  });
  const minimum3000 = offer({ minimum: { subtotal: 3_000 } });

  function bagSubtotal(quantity, offers) {
    const product = tee();
    const item = priceItem(product, null, offers, CTX);
    const facts = {
      product,
      variant: null,
      quantity,
      basePrice: product.price,
      offerPrice: item.effectivePrice,
      onSale: false,
      giftWorth: 0,
    };
    const deals = priceBagDeals([facts], offers, CTX);
    return item.effectivePrice * quantity - deals.discount;
  }

  it('3 tees at 1,000 with Buy 2 get 1 free is 2,000, so shipping is not free', () => {
    const subtotal = bagSubtotal(3, [dealOffer]);
    assert.equal(subtotal, 2_000);
    const result = quote({ subtotal, offers: [dealOffer, minimum3000] });
    assert.equal(result.fee, 115);
    assert.equal(result.reason, 'box');
  });

  it('the same bag before the deal (3,000) would have been free: the order must use 2,000', () => {
    assert.equal(quote({ subtotal: 3_000, offers: [dealOffer, minimum3000] }).fee, 0);
  });

  it('4 tees: one group free leaves 3,000 and shipping is free', () => {
    const subtotal = bagSubtotal(4, [dealOffer]);
    assert.equal(subtotal, 3_000);
    assert.equal(quote({ subtotal, offers: [dealOffer, minimum3000] }).fee, 0);
  });

  it('percent off 10% on 3 tees (2,700) stays under 3,000 (O12)', () => {
    const pct = parsed('pct10', {
      title: '10% off',
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
      reward: { kind: 'percentOff', percent: 10 },
    });
    const subtotal = priceItem(tee(), null, [pct], CTX).effectivePrice * 3;
    assert.equal(subtotal, 2_700);
    assert.equal(quote({ subtotal, offers: [pct, minimum3000] }).fee, 115);
  });
});

describe('M5 and M6 conditions: one matching item is enough', () => {
  const brandX = offer({
    conditions: { anyOf: [{ allOf: [{ field: 'brandId', in: ['brand-x'] }] }] },
  });
  const other = tee({ productId: 'other', brandId: 'nike' });
  const matching = tee({ productId: 'x-1', brandId: 'brand-x' });

  it('is free when one of the lines is Brand X', () => {
    assert.equal(quote({ offers: [brandX], lines: [other, matching] }).fee, 0);
  });

  it('pays the box fee when no line is Brand X', () => {
    assert.equal(quote({ offers: [brandX], lines: [other] }).fee, 115);
  });

  it('pays the box fee with an empty bag when the offer has conditions', () => {
    assert.equal(quote({ offers: [brandX], lines: [] }).fee, 115);
  });

  it('an offer for all products (no rules) is free for any bag', () => {
    assert.equal(quote({ offers: [offer()], lines: [other] }).fee, 0);
  });

  it('two groups are OR: either brand qualifies', () => {
    const either = offer({
      conditions: {
        anyOf: [
          { allOf: [{ field: 'brandId', in: ['brand-x'] }] },
          { allOf: [{ field: 'categoryIds', in: ['padel'] }] },
        ],
      },
    });
    assert.equal(quote({ offers: [either], lines: [tee({ categoryIds: ['padel'] })] }).fee, 0);
    assert.equal(quote({ offers: [either], lines: [matching] }).fee, 0);
    assert.equal(quote({ offers: [either], lines: [other] }).fee, 115);
  });

  it('a partial colour match (black only on a black+white product) still counts', () => {
    const blackOnly = offer({
      conditions: { anyOf: [{ allOf: [{ field: 'colors', in: ['black'] }] }] },
    });
    assert.equal(quote({ offers: [blackOnly], lines: [tee({ colors: ['black', 'white'] })] }).fee, 0);
    assert.equal(quote({ offers: [blackOnly], lines: [tee({ colors: ['white'] })] }).fee, 115);
  });

  it('a price rule counts the product price', () => {
    const expensive = offer({
      conditions: { anyOf: [{ allOf: [{ field: 'price', min: 1_500 }] }] },
    });
    assert.equal(quote({ offers: [expensive], lines: [tee({ price: 1_499 })] }).fee, 115);
    assert.equal(quote({ offers: [expensive], lines: [tee({ price: 1_500 })] }).fee, 0);
  });
});

describe('Except rules on a Free shipping offer', () => {
  const exceptBrandX = {
    exclude: { anyOf: [{ allOf: [{ field: 'brandId', in: ['brand-x'] }] }] },
  };

  it('an included product that is also excluded does not qualify (Except wins)', () => {
    const o = offer({
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
      ...exceptBrandX,
    });
    assert.equal(quote({ offers: [o], lines: [tee({ brandId: 'brand-x' })] }).fee, 115);
    assert.equal(
      quote({ offers: [o], lines: [tee({ brandId: 'brand-x' }), tee({ brandId: 'nike' })] }).fee,
      0,
    );
  });

  it('all products except Brand X: a bag with only Brand X is not free', () => {
    // Plan E15 / M5: "all products, Except: X" must not give free shipping to a bag of only X.
    const o = offer({ conditions: { anyOf: [] }, ...exceptBrandX });
    assert.equal(quote({ offers: [o], lines: [tee({ brandId: 'brand-x' })] }).fee, 115);
  });

  it('all products except Brand X: a bag with one other product is free', () => {
    const o = offer({ conditions: { anyOf: [] }, ...exceptBrandX });
    assert.equal(
      quote({ offers: [o], lines: [tee({ brandId: 'brand-x' }), tee({ brandId: 'nike' })] }).fee,
      0,
    );
  });
});

describe('C-rows: when a Free shipping offer is live (schedule, audience, state)', () => {
  it('C: starts exactly at startsAt (inclusive) and not one millisecond earlier', () => {
    const o = offer({ schedule: { startsAt: NOW, endsAt: null, timezone: 'Africa/Cairo' } });
    assert.equal(quote({ offers: [o] }).fee, 0);
    const early = { ...CTX, now: new Date(NOW.getTime() - 1) };
    assert.equal(quote({ offers: [o], ctx: early }).fee, 115);
  });

  it('C14: ends exactly at endsAt (exclusive)', () => {
    const o = offer({ schedule: { startsAt: null, endsAt: NOW, timezone: 'Africa/Cairo' } });
    assert.equal(quote({ offers: [o] }).fee, 115);
    const before = { ...CTX, now: new Date(NOW.getTime() - 1) };
    assert.equal(quote({ offers: [o], ctx: before }).fee, 0);
  });

  it('Cairo summer time: 12:00 Cairo on 1 Jul is 09:00 UTC', () => {
    const startsAt = new Date('2026-07-01T09:00:00Z');
    const o = offer({ schedule: { startsAt, endsAt: null, timezone: 'Africa/Cairo' } });
    const at = (iso) => ({ ...CTX, now: new Date(iso) });
    assert.equal(quote({ offers: [o], ctx: at('2026-07-01T08:59:59.999Z') }).fee, 115);
    assert.equal(quote({ offers: [o], ctx: at('2026-07-01T09:00:00Z') }).fee, 0);
  });

  it('Cairo winter time: 12:00 Cairo on 1 Dec is 10:00 UTC', () => {
    const startsAt = new Date('2026-12-01T10:00:00Z');
    const o = offer({ schedule: { startsAt, endsAt: null, timezone: 'Africa/Cairo' } });
    const at = (iso) => ({ ...CTX, now: new Date(iso) });
    assert.equal(quote({ offers: [o], ctx: at('2026-12-01T09:59:59.999Z') }).fee, 115);
    assert.equal(quote({ offers: [o], ctx: at('2026-12-01T10:00:00Z') }).fee, 0);
  });

  it('a paused, archived or ended offer never makes shipping free', () => {
    assert.equal(quote({ offers: [offer({ active: false })] }).fee, 115);
    assert.equal(quote({ offers: [offer({ archived: true })] }).fee, 115);
  });

  it('a signed-in-only offer is not free for a visitor but is for a signed-in shopper', () => {
    const o = offer({ audience: 'signedIn' });
    assert.equal(quote({ offers: [o], ctx: VISITOR }).fee, 115);
    assert.equal(quote({ offers: [o], ctx: CTX }).fee, 0);
  });

  it('coupon-code offers never apply (the shop sends no code)', () => {
    const o = offer({ requiresCode: true, visibility: 'code', code: 'QA10' });
    assert.equal(quote({ offers: [o] }).fee, 115);
  });
});

describe('M7 abroad: Free shipping offers never apply', () => {
  it('the box fee is paid and no offer is named', () => {
    const result = quote({ region: 'international', subtotal: 9_999, offers: [offer()] });
    assert.equal(result.fee, 1_800);
    assert.equal(result.reason, 'box');
    assert.equal(result.offerId, undefined);
  });

  it('a Settings free-over still applies abroad, and beats the offer in the reason', () => {
    const result = quote({
      region: 'international',
      subtotal: 3_000,
      settings: withFreeOver(3_000),
      offers: [offer()],
    });
    assert.equal(result.fee, 0);
    assert.equal(result.reason, 'freeOver');
  });

  it('a Settings promo still applies abroad', () => {
    const result = quote({ region: 'international', settings: withPromo({ fee: 900 }), offers: [offer()] });
    assert.equal(result.fee, 900);
    assert.equal(result.reason, 'promo');
  });
});

describe('M8 large orders: the fee is agreed, so no free shipping applies', () => {
  it('3,000 g exactly still fits box 2; 3,001 g is to be agreed', () => {
    assert.equal(
      planDelivery(EGYPT, 'egypt', parcelWeight([{ weightGrams: 3_000, quantity: 1 }])).kind,
      'box',
    );
    assert.equal(
      planDelivery(EGYPT, 'egypt', parcelWeight([{ weightGrams: 3_001, quantity: 1 }])).kind,
      'to-be-agreed',
    );
  });

  it('1,000 g is box 1 (115) and 1,001 g is box 2 (135)', () => {
    const fee = (grams) => {
      const plan = planDelivery(EGYPT, 'egypt', parcelWeight([{ weightGrams: grams, quantity: 1 }]));
      return plan.kind === 'box' ? plan.box.feeEgp : plan.kind;
    };
    assert.equal(fee(1_000), 115);
    assert.equal(fee(1_001), 135);
  });

  it('a plan of to-be-agreed never reaches shippingQuote: asking for a box that is too small throws', () => {
    assert.throws(() => quote({ weight: 3_001, offers: [offer()] }), /too-heavy/);
  });

  it('abroad too heavy cannot be ordered at all', () => {
    assert.equal(
      planDelivery(ABROAD, 'international', parcelWeight([{ weightGrams: 2_001, quantity: 1 }])).kind,
      'too-heavy',
    );
  });

  it('a fee still to be agreed compares only the items total with what checkout showed (ATS-152)', () => {
    const agreed = { kind: 'domestic-agreed', priceEgp: 0 };
    assert.deepEqual(missedOrderTotal({ shownShippingEgp: null, shownTotalEgp: 3_000 }, agreed, 3_080), {
      missedTotalEgp: 3_080,
      shippingEgp: 0,
    });
    assert.equal(missedOrderTotal({ shownShippingEgp: null, shownTotalEgp: 3_000 }, agreed, 3_000), null);
    assert.equal(missedOrderTotal({ shownShippingEgp: null, shownTotalEgp: null }, agreed, 5_000), null);
  });
});

describe('M9 Cash on Delivery deposit comes from the shipping fee', () => {
  it('a free-shipping order has a fee of exactly 0, so no deposit is due', () => {
    const result = quote({ offers: [offer()] });
    assert.equal(result.fee, 0);
    assert.equal(Number.isInteger(result.fee), true);
  });
});

describe('M11 the cheapest of box fee, promo, free-over and offer wins', () => {
  it('a promo cheaper than the box wins', () => {
    const result = quote({ settings: withPromo({ fee: 50 }) });
    assert.equal(result.fee, 50);
    assert.equal(result.reason, 'promo');
  });

  it('a promo dearer than the box loses to the box', () => {
    const result = quote({ settings: withPromo({ fee: 200 }) });
    assert.equal(result.fee, 115);
    assert.equal(result.reason, 'box');
  });

  it('a promo of 50 loses to a Free shipping offer (0)', () => {
    const result = quote({ settings: withPromo({ fee: 50 }), offers: [offer()] });
    assert.equal(result.fee, 0);
    assert.equal(result.reason, 'offer');
  });

  it('ties at 0: promo is named before free-over, free-over before the offer, offer before the box', () => {
    assert.equal(quote({ settings: withPromo({ fee: 0 }), offers: [offer()] }).reason, 'promo');
    const freeOverAndOffer = quote({ settings: withFreeOver(500), offers: [offer()] });
    assert.equal(freeOverAndOffer.fee, 0);
    assert.equal(freeOverAndOffer.reason, 'freeOver');
    const both = quote({
      settings: { ...withFreeOver(500), promo: { ...NO_PROMO, active: true, fee: 0 } },
      offers: [offer()],
    });
    assert.equal(both.reason, 'promo');
    const offerOnly = quote({ offers: [offer()] });
    assert.equal(offerOnly.reason, 'offer');
  });

  it('a free box (fee 0) ties with the offer and the box is named only when nothing else is free', () => {
    const freeBox = { ...SETTINGS, egyptBoxes: [{ ...EGYPT[0], feeEgp: 0 }, EGYPT[1]] };
    const withOffer = quote({ settings: freeBox, offers: [offer()] });
    assert.equal(withOffer.fee, 0);
    assert.equal(withOffer.reason, 'offer');
    assert.equal(quote({ settings: freeBox }).reason, 'box');
  });

  it('promo minimum, start and end (inclusive start, exclusive end)', () => {
    const gated = withPromo({ fee: 0, minSubtotal: 1_000 });
    assert.equal(quote({ settings: gated, subtotal: 999 }).fee, 115);
    assert.equal(quote({ settings: gated, subtotal: 1_000 }).fee, 0);

    const timed = withPromo({ fee: 0, startsAt: NOW, endsAt: new Date(NOW.getTime() + 60_000) });
    assert.equal(quote({ settings: timed }).reason, 'promo');
    const atEnd = { ...CTX, now: new Date(NOW.getTime() + 60_000) };
    assert.equal(quote({ settings: timed, ctx: atEnd }).reason, 'box');
    const beforeStart = { ...CTX, now: new Date(NOW.getTime() - 1) };
    assert.equal(quote({ settings: timed, ctx: beforeStart }).reason, 'box');
  });

  it('an inactive promo is ignored', () => {
    const off = { ...SETTINGS, promo: { ...NO_PROMO, active: false, fee: 0 } };
    assert.equal(quote({ settings: off }).fee, 115);
  });

  it('free-over is inclusive and ignored when inactive or when the threshold is empty', () => {
    assert.equal(quote({ settings: withFreeOver(3_000), subtotal: 2_999 }).fee, 115);
    assert.equal(quote({ settings: withFreeOver(3_000), subtotal: 3_000 }).fee, 0);
    assert.equal(quote({ settings: withFreeOver(3_000, false), subtotal: 9_000 }).fee, 115);
    assert.equal(quote({ settings: withFreeOver(null), subtotal: 9_000 }).fee, 115);
  });

  it('the fee is never negative and never a fraction', () => {
    const result = quote({ settings: withPromo({ fee: -20 }) });
    assert.equal(result.fee, 0);
    const fractional = quote({ settings: withPromo({ fee: 49.6 }) });
    assert.equal(fractional.fee, 50);
  });
});

describe('Free shipping offer id on the order (counts a use only when it made shipping free)', () => {
  const asQuote = (q) => ({ fee: q.fee, reason: q.reason, offerId: q.offerId, box: q.box });

  it('names the offer when it took a real fee to 0', () => {
    assert.equal(freeShippingOfferIdOf(asQuote(quote({ offers: [offer()] }))), 'free-ship');
  });

  it('names nothing when the box fee was already 0', () => {
    const freeBox = { ...SETTINGS, egyptBoxes: [{ ...EGYPT[0], feeEgp: 0 }, EGYPT[1]] };
    assert.equal(freeShippingOfferIdOf(asQuote(quote({ settings: freeBox, offers: [offer()] }))), null);
  });

  it('names nothing when the Settings promo or free-over already made it free', () => {
    assert.equal(
      freeShippingOfferIdOf(asQuote(quote({ settings: withPromo({ fee: 0 }), offers: [offer()] }))),
      null,
    );
    assert.equal(
      freeShippingOfferIdOf(asQuote(quote({ settings: withFreeOver(1), offers: [offer()] }))),
      null,
    );
  });

  it('names nothing when the offer did not apply', () => {
    assert.equal(freeShippingOfferIdOf(asQuote(quote())), null);
  });

  it('a Free shipping offer with limits is counted once for the order (kind shipping)', () => {
    const limited = offer({ limits: { totalUses: 5, perCustomer: 1 } });
    const map = new Map();
    addUsedOffer(map, [limited], 'free-ship', 'shipping');
    assert.deepEqual(Array.from(map.values()), [
      {
        offerId: 'free-ship',
        title: 'Free shipping',
        limits: { totalUses: 5, perCustomer: 1 },
        kind: 'shipping',
      },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// P1-P10 Use limits (pure parts)
// ---------------------------------------------------------------------------------------------

describe('P use limits: who still fits', () => {
  it('no limits always fits', () => {
    assert.equal(offerUseFits({ totalUses: null, perCustomer: null }, 9_999, 9_999), true);
  });

  it('P1 uses per customer 1: the second order of the same shopper does not fit', () => {
    const limits = { totalUses: null, perCustomer: 1 };
    assert.equal(offerUseFits(limits, 5, 0), true);
    assert.equal(offerUseFits(limits, 5, 1), false);
    assert.equal(offerFullReason(limits, 5, 1), 'used');
    // Another shopper (customer count 0) still gets it.
    assert.equal(offerUseFits(limits, 5, 0), true);
  });

  it('P2 total uses 2: the second use is the last one', () => {
    const limits = { totalUses: 2, perCustomer: null };
    assert.equal(offerUseFits(limits, 0, 0), true);
    assert.equal(offerUseFits(limits, 1, 0), true);
    assert.equal(offerUseFits(limits, 2, 0), false);
    assert.equal(isLastOfferUse(limits, 0), false);
    assert.equal(isLastOfferUse(limits, 1), true);
  });

  it('total uses 1: the very first use is the last one', () => {
    assert.equal(isLastOfferUse({ totalUses: 1, perCustomer: null }, 0), true);
  });

  it('a per-customer limit alone never switches the offer off', () => {
    assert.equal(isLastOfferUse({ totalUses: null, perCustomer: 1 }, 0), false);
    assert.equal(isLastOfferUse({ totalUses: null, perCustomer: null }, 0), false);
  });

  it('when both limits are used up, total ("ended") is reported before per customer ("used")', () => {
    const limits = { totalUses: 3, perCustomer: 1 };
    assert.equal(offerFullReason(limits, 3, 1), 'ended');
    assert.equal(offerFullReason(limits, 2, 1), 'used');
    assert.equal(offerFullReason(limits, 2, 0), null);
  });
});

describe('P refusal messages', () => {
  it('an ended offer names itself and gives its id for checkout', () => {
    const error = offerFullError(
      used('o1', 'Buy 2, get 1 free', { totalUses: 1, perCustomer: null }, 'deal'),
      'ended',
    );
    assert.equal(error.code, 'failed-precondition');
    assert.equal(
      error.message,
      "The Buy 2, get 1 free offer has ended, so this order's total changed. Check your bag and place your order again.",
    );
    assert.deepEqual(error.details, { endedOfferId: 'o1' });
  });

  it('an offer this shopper used up says "already used" and adds the reason', () => {
    const error = offerFullError(used('o1', '20% off', { totalUses: null, perCustomer: 1 }), 'used');
    assert.equal(
      error.message,
      "You've already used the 20% off offer, so this order's total changed. Check your bag and place your order again.",
    );
    assert.deepEqual(error.details, { endedOfferId: 'o1', reason: 'used' });
  });

  it('the title is trimmed, and an empty title falls back to plain words', () => {
    assert.match(
      offerFullError(used('o1', '  10% off  ', {}), 'ended').message,
      /^The 10% off offer has ended/,
    );
    assert.equal(
      offerFullError(used('o1', '   ', {}), 'ended').message,
      "An offer in your bag has ended, so this order's total changed. Check your bag and place your order again.",
    );
    assert.equal(
      offerFullError(used('o1', '', {}), 'used').message,
      "You've already used an offer in your bag, so this order's total changed. Check your bag and place your order again.",
    );
  });

  it('every offer type except Free gift refuses the same way', () => {
    for (const kind of ['deal', 'item', 'shipping']) {
      const error = offerFullError(used('o1', 'Free shipping', {}, kind), 'ended');
      assert.deepEqual(error.details, { endedOfferId: 'o1' });
      assert.match(error.message, /^The Free shipping offer has ended/);
    }
  });

  it('P4 a full Free gift offer asks the shopper to add the item again, with no offer id', () => {
    for (const reason of ['ended', 'used']) {
      const error = offerFullError(used('g1', 'Free shirt', {}, 'gift'), reason);
      assert.equal(error.code, 'failed-precondition');
      assert.equal(
        error.message,
        'A free gift offer in your bag has run out. Remove the item and add it again to order it without the gift.',
      );
      assert.equal(error.details, undefined);
    }
  });
});

describe('P2 / P3 / P8 counting inside the order (any offer type)', () => {
  it('P2 total uses 2: after two shoppers the offer is switched off by the system', async () => {
    const o = used('pct', '15% off', { totalUses: 2, perCustomer: null });
    const { db, tx, store } = fakeDb({ 'offers/pct': { active: true } });

    const first = (await readOfferUses(tx, db, 'A', [o]))();
    assert.deepEqual(first, []);
    assert.equal(store.get('offers/pct').active, true);
    assert.equal(store.get('offerUsage/pct').count, 1);

    const second = (await readOfferUses(tx, db, 'B', [o]))();
    assert.deepEqual(second, ['pct']);
    assert.equal(store.get('offers/pct').active, false);
    assert.equal(store.get('offers/pct').updatedBy, OFFER_LIMIT_ACTOR);
    assert.equal(OFFER_LIMIT_ACTOR, 'system:offer-limit');
    assert.equal(store.get('offerUsage/pct').count, 2);
    assert.equal(store.get('offerUsage/pct_A').count, 1);
    assert.equal(store.get('offerUsage/pct_B').count, 1);
  });

  it('P3 total 1: the first order wins, the second is refused with the ended message', async () => {
    const o = used('ship', 'Free shipping', { totalUses: 1, perCustomer: null }, 'shipping');
    const { db, tx } = fakeDb({ 'offers/ship': { active: true } });
    (await readOfferUses(tx, db, 'A', [o]))();
    await assert.rejects(readOfferUses(tx, db, 'B', [o]), (error) => {
      assert.equal(error.code, 'failed-precondition');
      assert.deepEqual(error.details, { endedOfferId: 'ship' });
      assert.match(error.message, /^The Free shipping offer has ended, so this order's total changed\./);
      return true;
    });
  });

  it('P1 per customer 1: A is refused the second time, B still gets it, and the offer stays on', async () => {
    const o = used('deal', 'Buy 2, get 1 free', { totalUses: null, perCustomer: 1 }, 'deal');
    const { db, tx, store } = fakeDb({ 'offers/deal': { active: true } });
    const firstA = (await readOfferUses(tx, db, 'A', [o]))();
    assert.deepEqual(firstA, []);
    await assert.rejects(readOfferUses(tx, db, 'A', [o]), (error) => {
      assert.deepEqual(error.details, { endedOfferId: 'deal', reason: 'used' });
      assert.match(error.message, /^You've already used the Buy 2, get 1 free offer/);
      return true;
    });
    (await readOfferUses(tx, db, 'B', [o]))();
    assert.equal(store.get('offers/deal').active, true);
    assert.equal(store.get('offerUsage/deal').count, 2);
  });

  it('several customer keys share one count (the highest is checked, every key goes up)', async () => {
    const o = used('deal', 'Buy 2, get 1 free', { totalUses: null, perCustomer: 1 }, 'deal');
    // Signed in first (uid + the guest key of the account email), then a guest order with that email.
    const { db, tx, store } = fakeDb({ 'offers/deal': { active: true } });
    (await readOfferUses(tx, db, ['uid1', 'guest_x'], [o]))();
    assert.equal(store.get('offerUsage/deal_uid1').count, 1);
    assert.equal(store.get('offerUsage/deal_guest_x').count, 1);
    await assert.rejects(readOfferUses(tx, db, ['guest_x'], [o]), (error) => {
      assert.deepEqual(error.details, { endedOfferId: 'deal', reason: 'used' });
      return true;
    });

    // Guest first, then signed in with the same email.
    const second = fakeDb({ 'offers/deal': { active: true } });
    (await readOfferUses(second.tx, second.db, ['guest_y'], [o]))();
    await assert.rejects(readOfferUses(second.tx, second.db, ['uid2', 'guest_y'], [o]), (error) => {
      assert.deepEqual(error.details, { endedOfferId: 'deal', reason: 'used' });
      return true;
    });
  });

  it('a refused order writes nothing', async () => {
    const o = used('deal', 'D', { totalUses: 1, perCustomer: null }, 'deal');
    const { db, tx, writes } = fakeDb({ 'offers/deal': { active: true }, 'offerUsage/deal': { count: 1 } });
    await assert.rejects(readOfferUses(tx, db, 'A', [o]));
    assert.equal(writes.length, 0);
  });

  it('P5 one use per order: three groups of the same offer are counted once', async () => {
    const o = offer({ id: 'deal', title: 'Buy 2, get 1 free', limits: { totalUses: 10, perCustomer: 2 } });
    const map = new Map();
    addUsedOffer(map, [o], 'deal', 'deal');
    addUsedOffer(map, [o], 'deal', 'deal');
    addUsedOffer(map, [o], 'deal', 'gift');
    assert.equal(map.size, 1);
    assert.equal(map.get('deal').kind, 'deal', 'the first kind seen wins');

    const { db, tx, store } = fakeDb({ 'offers/deal': { active: true } });
    (await readOfferUses(tx, db, 'A', Array.from(map.values())))();
    assert.equal(store.get('offerUsage/deal').count, 1);
    assert.equal(store.get('offerUsage/deal_A').count, 1);
  });

  it('two different offers in one order each count once, and each can end', async () => {
    const a = used('a', 'A', { totalUses: 1, perCustomer: null });
    const b = used('b', 'B', { totalUses: 5, perCustomer: null }, 'shipping');
    const { db, tx, store } = fakeDb({ 'offers/a': { active: true }, 'offers/b': { active: true } });
    const ended = (await readOfferUses(tx, db, 'A', [a, b]))();
    assert.deepEqual(ended, ['a']);
    assert.equal(store.get('offers/b').active, true);
    assert.equal(store.get('offerUsage/b').count, 1);
  });

  it('one full offer refuses the whole order before anything is counted', async () => {
    const full = used('full', 'Full', { totalUses: 1, perCustomer: null });
    const room = used('room', 'Room', { totalUses: 5, perCustomer: null });
    const { db, tx, writes } = fakeDb({ 'offerUsage/full': { count: 1 } });
    await assert.rejects(readOfferUses(tx, db, 'A', [room, full]));
    assert.equal(writes.length, 0);
  });

  it('P8 an offer staff already paused stays paused and keeps staff as the last editor', async () => {
    const o = used('pct', '15% off', { totalUses: 1, perCustomer: null });
    const { db, tx, store } = fakeDb({ 'offers/pct': { active: false, updatedBy: 'staff-uid' } });
    const ended = (await readOfferUses(tx, db, 'A', [o]))();
    assert.deepEqual(ended, []);
    assert.equal(store.get('offers/pct').active, false);
    assert.equal(store.get('offers/pct').updatedBy, 'staff-uid');
  });

  it('a missing offer document is never created by the limit switch', async () => {
    const o = used('gone', 'Gone', { totalUses: 1, perCustomer: null });
    const { db, tx, store } = fakeDb({});
    const ended = (await readOfferUses(tx, db, 'A', [o]))();
    assert.deepEqual(ended, []);
    assert.equal(store.has('offers/gone'), false);
  });

  it('a corrupt count is read as 0', async () => {
    const o = used('pct', 'P', { totalUses: 1, perCustomer: null });
    const { db, tx } = fakeDb({ 'offerUsage/pct': { count: 'many' }, 'offers/pct': { active: true } });
    const ended = (await readOfferUses(tx, db, 'A', [o]))();
    assert.deepEqual(ended, ['pct']);
  });
});

describe('P6 cancelled orders keep their use', () => {
  it('cancelOrder never touches offer usage', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/orders/cancel-order.fn.ts'), 'utf8');
    assert.equal(/offerUsage|releaseOfferUses|readOfferUses/.test(source), false);
  });
});

describe('P7 a Paymob start that fails gives the use back', () => {
  it('counts go back down and an offer the order switched off comes back on', async () => {
    const o = used('pct', '15% off', { totalUses: 1, perCustomer: null });
    const { db, tx, store } = fakeDb({ 'offers/pct': { active: true } });
    const ended = (await readOfferUses(tx, db, 'A', [o]))();
    assert.equal(store.get('offers/pct').active, false);
    await releaseOfferUses(db, 'A', [o], ended);
    assert.equal(store.get('offers/pct').active, true);
    assert.equal(store.get('offerUsage/pct').count, 0);
    assert.equal(store.get('offerUsage/pct_A').count, 0);
  });

  it('a count never goes below 0', async () => {
    const o = used('pct', 'P', { totalUses: 5, perCustomer: null });
    const { db, store } = fakeDb({ 'offerUsage/pct': { count: 0 }, 'offerUsage/pct_A': { count: 0 } });
    await releaseOfferUses(db, 'A', [o]);
    assert.equal(store.get('offerUsage/pct').count, 0);
  });

  it('an offer staff switched off themselves is never switched on', async () => {
    const o = used('pct', 'P', { totalUses: 1, perCustomer: null });
    const { db, store } = fakeDb({
      'offers/pct': { active: false, updatedBy: 'staff-uid' },
      'offerUsage/pct': { count: 1 },
    });
    await releaseOfferUses(db, 'A', [o], ['pct']);
    assert.equal(store.get('offers/pct').active, false);
  });
});

describe('confirmedEndedOfferIds: only ids the server can confirm are left out', () => {
  const limited = (id, limits) => ({ id, limits });

  it('confirms a total-full offer, and ignores an offer with room', async () => {
    const { db } = fakeDb({ 'offerUsage/full': { count: 2 }, 'offerUsage/room': { count: 1 } });
    const confirmed = await confirmedEndedOfferIds(
      db,
      'A',
      [
        limited('full', { totalUses: 2, perCustomer: null }),
        limited('room', { totalUses: 2, perCustomer: null }),
      ],
      ['full', 'room'],
    );
    assert.deepEqual(Array.from(confirmed), ['full']);
  });

  it('a per-customer limit is confirmed for that shopper only', async () => {
    const { db } = fakeDb({ 'offerUsage/o_A': { count: 1 } });
    const offers = [limited('o', { totalUses: null, perCustomer: 1 })];
    assert.deepEqual(Array.from(await confirmedEndedOfferIds(db, 'A', offers, ['o'])), ['o']);
    assert.deepEqual(Array.from(await confirmedEndedOfferIds(db, 'B', offers, ['o'])), []);
  });

  it('ignores ids that were not asked for, unknown ids and unlimited offers', async () => {
    const { db } = fakeDb({ 'offerUsage/a': { count: 9 }, 'offerUsage/free': { count: 9 } });
    const offers = [
      limited('a', { totalUses: 1, perCustomer: null }),
      limited('free', { totalUses: null, perCustomer: null }),
    ];
    assert.deepEqual(Array.from(await confirmedEndedOfferIds(db, 'A', offers, ['free', 'nope'])), []);
    assert.deepEqual(Array.from(await confirmedEndedOfferIds(db, 'A', offers, [])), []);
  });
});

describe('F8 / P10 limits count for every offer type', () => {
  it('Percent off with Total uses 1: the first order is counted and switches it off, the second is refused', async () => {
    const pct = parsed('pct', {
      title: '20% off',
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
      reward: { kind: 'percentOff', percent: 20 },
      limits: { totalUses: 1 },
    });
    assert.deepEqual(pct.limits, { totalUses: 1, perCustomer: null });
    const map = new Map();
    addUsedOffer(map, [pct], 'pct', 'item');
    assert.equal(map.size, 1);

    const { db, tx, store } = fakeDb({ 'offers/pct': { active: true } });
    (await readOfferUses(tx, db, 'A', Array.from(map.values())))();
    assert.equal(store.get('offers/pct').active, false);
    await assert.rejects(readOfferUses(tx, db, 'B', Array.from(map.values())), /20% off offer has ended/);
  });

  it('Amount off, Set price and Free shipping offers with limits are all tracked', () => {
    const rewards = [
      { kind: 'amountOff', amount: 100 },
      { kind: 'fixedPrice', price: 700 },
      { kind: 'freeShipping' },
    ];
    for (const reward of rewards) {
      const o = parsed(`o-${reward.kind}`, { title: reward.kind, reward, limits: { perCustomer: 1 } });
      assert.deepEqual(o.limits, { totalUses: null, perCustomer: 1 });
      const map = new Map();
      addUsedOffer(map, [o], o.id, reward.kind === 'freeShipping' ? 'shipping' : 'item');
      assert.equal(map.size, 1, `${reward.kind} should be tracked`);
    }
  });

  it('an offer with no limits is never tracked (no shared usage document)', () => {
    const map = new Map();
    addUsedOffer(map, [offer({ id: 'x' })], 'x', 'shipping');
    assert.equal(map.size, 0);
  });

  it('an id that is not among the offers is skipped', () => {
    const map = new Map();
    addUsedOffer(map, [offer({ id: 'x', limits: { totalUses: 1, perCustomer: null } })], 'other', 'item');
    assert.equal(map.size, 0);
  });

  it('missing or invalid limits read as unlimited', () => {
    const none = parsed('n', { reward: { kind: 'percentOff', percent: 10 } });
    assert.deepEqual(none.limits, { totalUses: null, perCustomer: null });
    const junk = parsed('j', {
      reward: { kind: 'percentOff', percent: 10 },
      limits: { totalUses: '5', perCustomer: null },
    });
    assert.deepEqual(junk.limits, { totalUses: null, perCustomer: null });
  });
});

// ---------------------------------------------------------------------------------------------
// R1-R5 / C14-C16 never charge more than checkout showed (pure comparisons)
// ---------------------------------------------------------------------------------------------

const PRODUCT_TEE = tee({ price: 1_000 });
const TEES = { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] };

function pct(id, percent, extra = {}) {
  return parsed(id, {
    title: `${percent}% off`,
    conditions: TEES,
    reward: { kind: 'percentOff', percent },
    ...extra,
  });
}

function serverPrice(offers, product = PRODUCT_TEE, ctx = CTX) {
  const item = priceItem(product, null, offers, ctx);
  return { unitEgp: item.effectivePrice, appliedOfferId: item.appliedOfferId };
}

const liveIds = (offers, ctx = CTX) => new Set(liveOffers(offers, ctx).map((o) => o.id));

describe('R1 / R2 / R3 a line that costs more than checkout showed', () => {
  it('R1 offer lowered from 20% to 10% after the page priced the bag: a miss on the same offer', () => {
    const lowered = pct('off', 10);
    const shown = [{ productId: 'tee-1', shownUnitEgp: 800, shownOfferId: 'off' }];
    const miss = missedLinePrice(shown, [serverPrice([lowered])], liveIds([lowered]));
    assert.deepEqual(miss, {
      missedPriceProductId: 'tee-1',
      shownOfferId: 'off',
      live: true,
      sameOffer: true,
    });
  });

  it('R1 offer raised from 10% to 20%: the shopper is charged less and nothing is refused', () => {
    const raised = pct('off', 20);
    const shown = [{ productId: 'tee-1', shownUnitEgp: 900, shownOfferId: 'off' }];
    assert.equal(missedLinePrice(shown, [serverPrice([raised])], liveIds([raised])), null);
  });

  it('R2 a new 20% offer the page did not know: cheaper than shown, so fine', () => {
    const fresh = pct('new', 20);
    const shown = [{ productId: 'tee-1', shownUnitEgp: 1_000, shownOfferId: null }];
    assert.equal(missedLinePrice(shown, [serverPrice([fresh])], liveIds([fresh])), null);
  });

  it('R3 an offer paused in the last minute: dearer than shown, a miss with the offer not live', () => {
    const paused = pct('off', 20, { active: false });
    const shown = [{ productId: 'tee-1', shownUnitEgp: 800, shownOfferId: 'off' }];
    const miss = missedLinePrice(shown, [serverPrice([paused])], liveIds([paused]));
    assert.deepEqual(miss, {
      missedPriceProductId: 'tee-1',
      shownOfferId: 'off',
      live: false,
      sameOffer: false,
    });
    assert.deepEqual(priceChangedError(miss).details, { endedOfferId: 'off' });
  });

  it('equal prices never miss', () => {
    const shown = [{ productId: 'tee-1', shownUnitEgp: 800, shownOfferId: 'off' }];
    const offers = [pct('off', 20)];
    assert.equal(missedLinePrice(shown, [serverPrice(offers)], liveIds(offers)), null);
  });

  it('a page that sent no shown price is not compared', () => {
    const shown = [{ productId: 'tee-1', shownUnitEgp: null, shownOfferId: null }];
    assert.equal(missedLinePrice(shown, [{ unitEgp: 1_000, appliedOfferId: null }], new Set()), null);
  });

  it('with several lines the first dearer line is named', () => {
    const shown = [
      { productId: 'a', shownUnitEgp: 500, shownOfferId: null },
      { productId: 'b', shownUnitEgp: 500, shownOfferId: null },
      { productId: 'c', shownUnitEgp: 500, shownOfferId: null },
    ];
    const server = [
      { unitEgp: 400, appliedOfferId: null },
      { unitEgp: 501, appliedOfferId: null },
      { unitEgp: 900, appliedOfferId: null },
    ];
    assert.equal(missedLinePrice(shown, server, new Set())?.missedPriceProductId, 'b');
  });

  it('a shown unit price is read rounded down so a fraction can never allow a dearer order', () => {
    assert.equal(parseShownAmountEgp(115.9), 115);
    assert.equal(parseShownAmountEgp(-1), null);
    assert.equal(parseShownAmountEgp('115'), null);
    assert.equal(parseShownAmountEgp(Number.NaN), null);
    assert.equal(parseShownAmountEgp(undefined), null);
  });
});

describe('R5 product price changed while an offer applies', () => {
  it('10% off a 1,000 product is 900; raised to 1,200 it is 1,080 and the line misses', () => {
    const off = pct('off', 10);
    assert.equal(serverPrice([off]).unitEgp, 900);
    const raised = serverPrice([off], tee({ price: 1_200 }));
    assert.equal(raised.unitEgp, 1_080);
    const miss = missedLinePrice(
      [{ productId: 'tee-1', shownUnitEgp: 900, shownOfferId: 'off' }],
      [raised],
      liveIds([off]),
    );
    assert.deepEqual(priceChangedError(miss).details, {
      priceChanged: true,
      productId: 'tee-1',
      changedOfferId: 'off',
    });
  });

  it('a product price rise with no offer shown asks checkout to read the products again', () => {
    const miss = missedLinePrice(
      [{ productId: 'tee-1', shownUnitEgp: 1_000, shownOfferId: null }],
      [{ unitEgp: 1_200, appliedOfferId: null }],
      new Set(),
    );
    assert.deepEqual(priceChangedError(miss).details, { priceChanged: true, productId: 'tee-1' });
  });

  it('a lower product price is never refused', () => {
    const miss = missedLinePrice(
      [{ productId: 'tee-1', shownUnitEgp: 900, shownOfferId: 'off' }],
      [serverPrice([pct('off', 10)], tee({ price: 800 }))],
      new Set(['off']),
    );
    assert.equal(miss, null);
  });
});

describe('every price refusal uses the same shopper-facing message', () => {
  it('priceChangedError, totalChangedError and dealChangedError', () => {
    const line = { missedPriceProductId: 'p', shownOfferId: 'o', live: true, sameOffer: false };
    assert.equal(priceChangedError(line).message, CHANGED);
    assert.equal(totalChangedError({ missedTotalEgp: 1, shippingEgp: 1 }, 0).message, CHANGED);
    assert.equal(dealChangedError('o').message, CHANGED);
    assert.equal(priceChangedError(line).code, 'failed-precondition');
  });

  it('a live offer that no longer gives the price leaves it to checkout to drop after two misses', () => {
    const live = { missedPriceProductId: 'p', shownOfferId: 'o', live: true, sameOffer: false };
    assert.deepEqual(priceChangedError(live).details, { changedOfferId: 'o' });
    const ended = { ...live, live: false };
    assert.deepEqual(priceChangedError(ended).details, { endedOfferId: 'o' });
  });
});

describe('C14 / C16 an offer that ends exactly while the shopper is checking out', () => {
  it('at the end time the offer is gone, so the server price is the full price', () => {
    const ends = new Date('2026-11-10T12:00:00Z');
    const off = pct('off', 20, { schedule: { startsAt: null, endsAt: ends } });
    const before = { ...CTX, now: new Date(ends.getTime() - 1_000) };
    const after = { ...CTX, now: ends };
    assert.equal(serverPrice([off], PRODUCT_TEE, before).unitEgp, 800);
    assert.equal(serverPrice([off], PRODUCT_TEE, after).unitEgp, 1_000);
  });

  it('C16 the order is refused, not charged full price: ended offer named in the details', () => {
    const ends = new Date('2026-11-10T12:00:00Z');
    const off = pct('off', 20, { schedule: { startsAt: null, endsAt: ends } });
    const shown = [{ productId: 'tee-1', shownUnitEgp: 800, shownOfferId: 'off' }];
    const miss = missedLinePrice(shown, [serverPrice([off])], liveIds([off]));
    assert.ok(miss);
    assert.equal(miss.live, false);
    const error = priceChangedError(miss);
    assert.equal(error.message, CHANGED);
    assert.deepEqual(error.details, { endedOfferId: 'off' });
  });
});

describe('C15 a Buy X Get Y offer that ended during checkout', () => {
  it('the bag showed it, the order does not apply it: the id is named', () => {
    assert.equal(missedDealOfferId(['deal-1'], []), 'deal-1');
    assert.equal(missedDealOfferId(['deal-1'], ['deal-1']), null);
    assert.equal(missedDealOfferId([], ['deal-1']), null, 'a discount the page did not show is never a miss');
    assert.equal(missedDealOfferId(['a', 'b'], ['b']), 'a');
    assert.equal(missedDealOfferId([], []), null);
  });

  it('an offer that is no longer live is refused as ended with its title', () => {
    const error = missedDealError({ missedDealOfferId: 'deal-1', title: 'Buy 2, get 1 free', live: false });
    assert.equal(
      error.message,
      "The Buy 2, get 1 free offer has ended, so this order's total changed. Check your bag and place your order again.",
    );
    assert.deepEqual(error.details, { endedOfferId: 'deal-1' });
  });

  it('a live offer that was still not applied says the prices changed', () => {
    const error = missedDealError({ missedDealOfferId: 'deal-1', title: 'Buy 2, get 1 free', live: true });
    assert.equal(error.message, CHANGED);
    assert.deepEqual(error.details, { changedOfferId: 'deal-1' });
  });

  it('an ended deal with no title still reads plainly', () => {
    const error = missedDealError({ missedDealOfferId: 'deal-1', title: '', live: false });
    assert.match(error.message, /^An offer in your bag has ended, so this order's total changed\./);
  });
});

describe('R / ATS-147 the shipping fee or total is never higher than checkout showed', () => {
  const box = { kind: 'domestic-box', priceEgp: 115 };

  it('a fee that went up (free shipping lost) is a miss', () => {
    const miss = missedOrderTotal({ shownShippingEgp: 0, shownTotalEgp: 3_000 }, box, 3_115);
    assert.deepEqual(miss, { missedTotalEgp: 3_115, shippingEgp: 115 });
  });

  it('a total that went up with the same fee is a miss', () => {
    const miss = missedOrderTotal({ shownShippingEgp: 115, shownTotalEgp: 2_115 }, box, 2_116);
    assert.deepEqual(miss, { missedTotalEgp: 2_116, shippingEgp: 115 });
  });

  it('a fee that went up while the total stays the same or lower is still a miss', () => {
    const miss = missedOrderTotal({ shownShippingEgp: 0, shownTotalEgp: 5_000 }, box, 2_115);
    assert.ok(miss, 'the fee alone is higher than shown');
  });

  it('equal or lower fee and total pass (charging less is fine)', () => {
    assert.equal(missedOrderTotal({ shownShippingEgp: 115, shownTotalEgp: 2_115 }, box, 2_115), null);
    assert.equal(missedOrderTotal({ shownShippingEgp: 135, shownTotalEgp: 2_135 }, box, 2_115), null);
    assert.equal(
      missedOrderTotal(
        { shownShippingEgp: 115, shownTotalEgp: 2_115 },
        { kind: 'domestic-box', priceEgp: 0 },
        2_000,
      ),
      null,
    );
  });

  it('values a page did not send are not compared', () => {
    assert.equal(missedOrderTotal({ shownShippingEgp: null, shownTotalEgp: null }, box, 99_999), null);
    assert.ok(missedOrderTotal({ shownShippingEgp: 100, shownTotalEgp: null }, box, 1));
  });

  it('a box fee is a miss when checkout showed a fee to be agreed (ATS-152)', () => {
    // No shipping fee and a total = checkout showed the items total "+ shipping".
    assert.ok(missedOrderTotal({ shownShippingEgp: null, shownTotalEgp: 2_000 }, box, 2_000));
    assert.ok(missedOrderTotal({ shownShippingEgp: null, shownTotalEgp: 2_000 }, box, 2_115));
    assert.equal(
      missedOrderTotal(
        { shownShippingEgp: null, shownTotalEgp: 2_000 },
        { kind: 'domestic-box', priceEgp: 0 },
        2_000,
      ),
      null,
    );
  });

  it('abroad box fees are compared the same way', () => {
    const abroad = { kind: 'international-box', priceEgp: 1_800 };
    assert.ok(missedOrderTotal({ shownShippingEgp: 0, shownTotalEgp: null }, abroad, 1_800));
    assert.equal(missedOrderTotal({ shownShippingEgp: 1_800, shownTotalEgp: 2_800 }, abroad, 2_800), null);
  });

  it('the refusal carries the server figures, the server clock and a re-read hint', () => {
    const error = totalChangedError({ missedTotalEgp: 3_115, shippingEgp: 115 }, 1_700_000_000_000);
    assert.equal(error.code, 'failed-precondition');
    assert.equal(error.message, CHANGED);
    assert.deepEqual(error.details, {
      priceChanged: true,
      totalChanged: { shippingEgp: 115, totalEgp: 3_115 },
      nowMs: 1_700_000_000_000,
    });
  });

  it('the exact free-shipping minimum: 2,999 shown free-by-error is refused, 3,000 passes', () => {
    // Checkout showed shipping 0 at a 3,000 subtotal. If the server's subtotal is 2,999 the fee is 115.
    const o = offer({ minimum: { subtotal: 3_000 } });
    const server = quote({ subtotal: 2_999, offers: [o] });
    assert.ok(
      missedOrderTotal(
        { shownShippingEgp: 0, shownTotalEgp: 3_000 },
        { kind: 'domestic-box', priceEgp: server.fee },
        2_999 + server.fee,
      ),
    );
    const ok = quote({ subtotal: 3_000, offers: [o] });
    assert.equal(
      missedOrderTotal(
        { shownShippingEgp: 0, shownTotalEgp: 3_000 },
        { kind: 'domestic-box', priceEgp: ok.fee },
        3_000 + ok.fee,
      ),
      null,
    );
  });
});

describe('missedBasePrice: pieces in a Buy X Get Y group pay the base price', () => {
  it('a rise on a line with deal pieces is a miss with the base-rose marker', () => {
    const miss = missedBasePrice([{ productId: 'p', shownBaseEgp: 1_000, baseEgp: 1_100, dealUnits: 1 }]);
    assert.deepEqual(miss, {
      missedPriceProductId: 'p',
      shownOfferId: null,
      live: false,
      sameOffer: false,
      baseRose: true,
    });
    assert.deepEqual(priceChangedError(miss).details, { priceChanged: true, productId: 'p' });
  });

  it('no deal pieces, no shown base, equal or lower base: not a miss', () => {
    assert.equal(
      missedBasePrice([{ productId: 'p', shownBaseEgp: 1_000, baseEgp: 1_100, dealUnits: 0 }]),
      null,
    );
    assert.equal(
      missedBasePrice([{ productId: 'p', shownBaseEgp: null, baseEgp: 1_100, dealUnits: 2 }]),
      null,
    );
    assert.equal(
      missedBasePrice([{ productId: 'p', shownBaseEgp: 1_000, baseEgp: 1_000, dealUnits: 2 }]),
      null,
    );
    assert.equal(
      missedBasePrice([{ productId: 'p', shownBaseEgp: 1_000, baseEgp: 900, dealUnits: 2 }]),
      null,
    );
  });
});

describe('priceWithFreshOffersOnMiss: re-read the offers before refusing', () => {
  const LINE_MISS = { missedPriceProductId: 'p', shownOfferId: 'o', live: false, sameOffer: false };
  const TOTAL_MISS = { missedTotalEgp: 3_115, shippingEgp: 115 };
  const DEAL_MISS = { missedDealOfferId: 'deal-1', title: 'Buy 2, get 1 free', live: false };

  it('a first-pass miss that the fresh offers fix returns the fresh result', async () => {
    const calls = [];
    const result = await priceWithFreshOffersOnMiss(
      async (fresh) => {
        calls.push(fresh);
        return fresh ? ['new-offer'] : [];
      },
      async (offers) => (offers.length === 0 ? LINE_MISS : { total: 800 }),
    );
    assert.deepEqual(result, { total: 800 });
    assert.deepEqual(calls, [false, true]);
  });

  it('a clean first pass never reads the offers again', async () => {
    const calls = [];
    const result = await priceWithFreshOffersOnMiss(
      async (fresh) => {
        calls.push(fresh);
        return [];
      },
      async () => ({ total: 1 }),
    );
    assert.deepEqual(result, { total: 1 });
    assert.deepEqual(calls, [false]);
  });

  it('a line that still misses is refused with the price message', async () => {
    await assert.rejects(
      priceWithFreshOffersOnMiss(
        async () => [],
        async () => LINE_MISS,
      ),
      (error) => {
        assert.equal(error.message, CHANGED);
        assert.deepEqual(error.details, { endedOfferId: 'o' });
        return true;
      },
    );
  });

  it('a total that still misses is refused with the server figures', async () => {
    await assert.rejects(
      priceWithFreshOffersOnMiss(
        async () => [],
        async () => TOTAL_MISS,
      ),
      (error) => {
        assert.equal(error.message, CHANGED);
        assert.equal(error.details.priceChanged, true);
        assert.deepEqual(error.details.totalChanged, { shippingEgp: 115, totalEgp: 3_115 });
        assert.equal(typeof error.details.nowMs, 'number');
        return true;
      },
    );
  });

  it('a deal that still misses is refused as ended when not live', async () => {
    await assert.rejects(
      priceWithFreshOffersOnMiss(
        async () => [],
        async () => DEAL_MISS,
      ),
      (error) => {
        assert.match(error.message, /^The Buy 2, get 1 free offer has ended/);
        assert.deepEqual(error.details, { endedOfferId: 'deal-1' });
        return true;
      },
    );
  });

  it('a total miss that is fixed by fresh offers (free shipping offer created in the last minute) passes', async () => {
    let pass = 0;
    const result = await priceWithFreshOffersOnMiss(
      async (fresh) => (fresh ? [offer()] : []),
      async (offers) => {
        pass += 1;
        const q = quote({ subtotal: 2_000, offers });
        // Checkout showed free shipping; the cached server has no offer yet.
        return (
          missedOrderTotal(
            { shownShippingEgp: 0, shownTotalEgp: 2_000 },
            { kind: 'domestic-box', priceEgp: q.fee },
            2_000 + q.fee,
          ) ?? {
            fee: q.fee,
          }
        );
      },
    );
    assert.equal(pass, 2);
    assert.deepEqual(result, { fee: 0 });
  });
});
