import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { onePerModel } from '../src/app/core/services/products/utils/one-per-model.ts';
import {
  decideBrandPage,
  decideCategoryPage,
} from '../src/app/features/category/utils/catalog-page-state.ts';
import {
  pathOpensDeletedBuiltIn,
  readDeletedBuiltInIds,
} from '../src/app/core/services/products/utils/deleted-built-ins.ts';
import { removeFromMenu } from '../src/app/features/admin/pages/catalog-manager/utils/menu-placement.utils.ts';
import {
  shopCategoryFilterIds,
  shopCategoryIdForSlug,
  shopCategoryOptionsFrom,
  shopTabFor,
  shopTabLabel,
  shopTabsFrom,
  withChosenCategories,
} from '../src/app/core/services/products/utils/shop-categories.ts';
import {
  effectiveNavTarget,
  isOutsideAddress,
  navTargetFromPath,
  navTargetName,
  navTargetPath,
  outsideLinkProblem,
  resolveNavTarget,
} from '../src/app/core/services/navigation/nav-target.ts';
import {
  expandAutoColumns,
  navAutoColumnLinks,
  navNeedsBrands,
  timeToMs,
} from '../src/app/core/services/navigation/nav-auto-columns.ts';
import {
  canCheckout,
  cartSubtotalDisplay,
  lineDisplayAmount,
} from '../src/app/core/services/cart/cart-pricing.ts';
import {
  addCartLine,
  cartLineKey,
  clampLineQuantity,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  mergeCartLines,
} from '../src/app/core/services/cart/cart.model.ts';
import {
  bagGiftKey,
  bagKeyOf,
  dismissOfferNote,
  giftNoteText,
  nextBagNotes,
  NO_BAG_NOTES,
  offerNoteText,
  unavailableGiftsMessage,
} from '../src/app/core/services/cart/bag-offer-notes.ts';
import {
  endedOfferIdFrom,
  endedOfferReasonFrom,
  isFailedPrecondition,
  offerToLeaveOut,
  priceChangedFrom,
  serverClockFrom,
  serverTotalsToShow,
  totalChangedFrom,
} from '../src/app/core/services/orders/order-refusal.ts';
import {
  bannerCountdown,
  bannerOffers,
  bannerText,
  canShopOffer,
  dealHintAction,
  dealHintText,
  EARNED_LABEL_MAX,
  earnedItemLabel,
  bundleNudgeText,
  bundleSetNudgeButton,
  bundleSetNudgeLoses,
  bundleSetNudgeText,
  bundleSetStripTitle,
  bundleStripTitle,
  offerShopSubtitle,
  offerTitleVisible,
  shortItemWord,
} from '../src/app/core/services/offers/offer-shop.ts';

describe('cart-pricing (AS-33)', () => {
  it('lineDisplayAmount multiplies converted unit price by quantity', () => {
    assert.equal(lineDisplayAmount(100, 3), 300);
    assert.equal(lineDisplayAmount(12.5, 2), 25);
  });

  it('lineDisplayAmount rejects invalid quantity or unit', () => {
    assert.equal(lineDisplayAmount(100, 0), 0);
    assert.equal(lineDisplayAmount(100, -1), 0);
    assert.equal(lineDisplayAmount(Number.NaN, 2), 0);
  });

  it('cartSubtotalDisplay sums known line totals and skips missing prices', () => {
    const prices = new Map([
      ['a', 200],
      ['b', 50],
    ]);
    const lines = [
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
      { productId: 'missing', quantity: 4 },
    ];
    assert.equal(cartSubtotalDisplay(lines, prices), 450);
  });

  it('cartSubtotalDisplay is zero for an empty bag', () => {
    assert.equal(cartSubtotalDisplay([], new Map()), 0);
  });
});

describe('cart checkout CTA (AS-35)', () => {
  it('canCheckout is true only when the bag has items', () => {
    assert.equal(canCheckout(false), false);
    assert.equal(canCheckout(true), true);
  });
});

describe('cart lines merge (ATS-70)', () => {
  const line = (productId, quantity, selection = {}) => ({
    productId,
    variantId: null,
    selection,
    quantity,
  });

  it('addCartLine adds quantity to the same product with the same choices, capped at 20', () => {
    const lines = [line('p1', 15, { size: 'm' })];
    const next = addCartLine(lines, line('p1', 9, { size: 'm' }));
    assert.equal(next.length, 1);
    assert.equal(next[0].quantity, 20);
  });

  it('addCartLine keeps different choices on their own lines', () => {
    const next = addCartLine([line('p1', 1, { size: 'm' })], line('p1', 2, { size: 'l' }));
    assert.equal(next.length, 2);
    assert.equal(next[1].quantity, 2);
  });

  it('addCartLine drops a new line past the line limit', () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, i) => line(`p${i}`, 1));
    assert.equal(addCartLine(full, line('extra', 1)), full);
    assert.equal(addCartLine(full, line('p0', 1))[0].quantity, 2);
  });

  it('mergeCartLines adds the guest bag to the account bag without dropping either', () => {
    const account = [line('a', 2), line('b', 1, { color: 'black' })];
    const guest = [line('b', 3, { color: 'black' }), line('c', 1)];
    const merged = mergeCartLines(account, guest);
    assert.deepEqual(
      merged.map((entry) => [entry.productId, entry.quantity]),
      [
        ['a', 2],
        ['b', 4],
        ['c', 1],
      ],
    );
  });

  it('clampLineQuantity keeps quantities between 1 and 20', () => {
    assert.equal(clampLineQuantity(0), 1);
    assert.equal(clampLineQuantity(25), MAX_LINE_QUANTITY);
    assert.equal(clampLineQuantity(Number.NaN), 1);
    assert.equal(clampLineQuantity(3.7), 3);
  });
});

describe('order refusals (ATS-108)', () => {
  it('leaves an offer out only when its use limit ended it (endedOfferId)', () => {
    assert.equal(
      endedOfferIdFrom({ code: 'functions/failed-precondition', details: { endedOfferId: 'deal-1' } }),
      'deal-1',
    );
  });

  it('never leaves out an offer from "Prices in your bag changed" (changedOfferId)', () => {
    assert.equal(
      endedOfferIdFrom({ code: 'functions/failed-precondition', details: { changedOfferId: 'deal-1' } }),
      null,
    );
    assert.equal(endedOfferIdFrom(new Error('offline')), null);
    assert.equal(endedOfferIdFrom(null), null);
  });

  it('leaves out a changed offer only when the same one is refused twice in a row', () => {
    const changed = { details: { changedOfferId: 'deal-1' } };
    const first = offerToLeaveOut(changed, null);
    assert.deepEqual(first, { leaveOut: null, reason: 'ended', lastChangedOfferId: 'deal-1' });
    assert.deepEqual(offerToLeaveOut(changed, first.lastChangedOfferId), {
      leaveOut: 'deal-1',
      reason: 'ended',
      lastChangedOfferId: null,
    });
    assert.deepEqual(offerToLeaveOut({ details: { changedOfferId: 'deal-2' } }, 'deal-1'), {
      leaveOut: null,
      reason: 'ended',
      lastChangedOfferId: 'deal-2',
    });
    assert.deepEqual(offerToLeaveOut({ details: { endedOfferId: 'deal-3' } }, 'deal-1'), {
      leaveOut: 'deal-3',
      reason: 'ended',
      lastChangedOfferId: null,
    });
    assert.deepEqual(offerToLeaveOut(new Error('offline'), 'deal-1'), {
      leaveOut: null,
      reason: 'ended',
      lastChangedOfferId: null,
    });
  });

  it('reads the products again after a refusal about the bag (failed-precondition)', () => {
    assert.equal(isFailedPrecondition({ code: 'functions/failed-precondition' }), true);
    assert.equal(isFailedPrecondition({ code: 'functions/unavailable' }), false);
    assert.equal(isFailedPrecondition(new Error('offline')), false);
  });

  it("says when the shopper already used the offer up (details.reason 'used')", () => {
    assert.equal(endedOfferReasonFrom({ details: { endedOfferId: 'deal-1', reason: 'used' } }), 'used');
    assert.equal(endedOfferReasonFrom({ details: { endedOfferId: 'deal-1' } }), 'ended');
    assert.equal(endedOfferReasonFrom(new Error('offline')), 'ended');
    assert.equal(
      offerToLeaveOut({ details: { endedOfferId: 'deal-4', reason: 'used' } }, null).reason,
      'used',
    );
  });
});

describe('price offer refusals (ATS-139)', () => {
  it('reads the products again only when the line had no offer (priceChanged)', () => {
    assert.equal(priceChangedFrom({ details: { priceChanged: true, productId: 'tee-1' } }), true);
    assert.equal(priceChangedFrom({ details: { changedOfferId: 'off-20' } }), false);
    assert.equal(priceChangedFrom(new Error('offline')), false);
    assert.equal(priceChangedFrom(null), false);
  });

  it('leaves out a price offer the same way as a Buy X Get Y offer', () => {
    // Paused or ended on the server: left out at once.
    assert.deepEqual(offerToLeaveOut({ details: { endedOfferId: 'off-20' } }, null), {
      leaveOut: 'off-20',
      reason: 'ended',
      lastChangedOfferId: null,
    });
    // Still live but no longer gives that price: only after the second refusal in a row.
    const first = offerToLeaveOut({ details: { changedOfferId: 'off-20' } }, null);
    assert.equal(first.leaveOut, null);
    assert.equal(
      offerToLeaveOut({ details: { changedOfferId: 'off-20' } }, first.lastChangedOfferId).leaveOut,
      'off-20',
    );
  });
});

describe('shipping and total refusals (ATS-147)', () => {
  const refusal = (shippingEgp, totalEgp) => ({
    details: { priceChanged: true, totalChanged: { shippingEgp, totalEgp }, nowMs: 1_700_000_000_000 },
  });

  it('reads the server totals and clock, and reads the products again', () => {
    assert.deepEqual(totalChangedFrom(refusal(115, 2105)), { shippingEgp: 115, totalEgp: 2105 });
    assert.equal(serverClockFrom(refusal(115, 2105)), 1_700_000_000_000);
    assert.equal(priceChangedFrom(refusal(115, 2105)), true);
    assert.equal(totalChangedFrom({ details: { priceChanged: true, productId: 'tee-1' } }), null);
    assert.equal(
      totalChangedFrom({ details: { totalChanged: { shippingEgp: '115', totalEgp: 2105 } } }),
      null,
    );
    assert.equal(serverClockFrom({ details: { changedOfferId: 'off-20' } }), null);
    assert.equal(totalChangedFrom(new Error('offline')), null);
    assert.equal(serverClockFrom(null), null);
  });

  it('shows the server totals only when the same ones are refused twice in a row', () => {
    const first = serverTotalsToShow(refusal(115, 2105), null);
    assert.deepEqual(first, { show: null, last: { shippingEgp: 115, totalEgp: 2105 } });
    assert.deepEqual(serverTotalsToShow(refusal(115, 2105), first.last), {
      show: { shippingEgp: 115, totalEgp: 2105 },
      last: null,
    });
    // Different totals start again; any other error forgets them.
    assert.deepEqual(serverTotalsToShow(refusal(135, 2125), first.last), {
      show: null,
      last: { shippingEgp: 135, totalEgp: 2125 },
    });
    assert.deepEqual(serverTotalsToShow(new Error('offline'), first.last), { show: null, last: null });
  });
});

describe('bag Buy X Get Y nudge (ATS-130)', () => {
  const atom = (field, ids) => ({ anyOf: [{ allOf: [{ field, in: ids }] }] });
  const offer = (conditions, extra = {}) => ({
    id: 'b2g1',
    title: 'Buy 2, get 1 free',
    visibility: 'public',
    audience: 'everyone',
    requiresCode: false,
    limits: { totalUses: null, perCustomer: null },
    conditions,
    reward: {
      kind: 'buyXGetY',
      buy: { quantity: 2 },
      get: { quantity: 1, percent: 100 },
      getConditions: null,
    },
    ...extra,
  });
  const hint = (missing, extra = {}) => ({
    kind: 'add-more',
    offerId: 'b2g1',
    title: 'Buy 2, get 1 free',
    lineIndex: 0,
    missing,
    free: 1,
    percent: 100,
    samePool: true,
    productIds: [],
    ...extra,
  });
  const names = (id) => (id === 't-shirts' ? 'T-shirts & polos' : null);

  it('one product: Add 2 more of the same item', () => {
    const one = offer(atom('productId', ['polo-1']));
    assert.equal(dealHintAction(one), 'add-same');
    assert.equal(dealHintText(hint(2), one, names), 'Add 2 more to get 1 free');
  });

  it('one category: names it and links to the offer', () => {
    const tees = offer(atom('categoryIds', ['t-shirts']));
    assert.equal(dealHintAction(tees), 'shop');
    assert.equal(dealHintText(hint(2), tees, names), 'Add 2 more from T-shirts & polos to get 1 free');
    assert.equal(dealHintText(hint(2), tees), 'Add 2 more items to get 1 free');
  });

  it('whole store, brand or a list: items, with the right singular', () => {
    assert.equal(dealHintText(hint(2), offer({ anyOf: [] })), 'Add any 2 more items to get 1 free');
    const brand = offer(atom('brandId', ['adidas']));
    assert.equal(dealHintAction(brand), 'shop');
    assert.equal(dealHintText(hint(1), brand), 'Add 1 more item to get 1 free');
    assert.equal(dealHintAction(offer(atom('productId', ['a', 'b']))), 'shop');
  });

  it('an offer Shop cannot list (signed-in only or with a code) opens Shop instead', () => {
    const signedIn = offer({ anyOf: [] }, { audience: 'signedIn' });
    assert.equal(canShopOffer(signedIn), false);
    assert.equal(dealHintAction(signedIn), 'browse');
    assert.equal(dealHintText(hint(2), signedIn), 'Add any 2 more items to get 1 free');
    assert.equal(dealHintAction(offer({ anyOf: [] }, { requiresCode: true })), 'browse');
    const limited = offer({ anyOf: [] }, { limits: { totalUses: null, perCustomer: 1 } });
    assert.equal(canShopOffer(limited), false, 'a per-customer offer is for signed-in shoppers only');
    assert.equal(dealHintAction(limited), 'browse');
    const onePolo = offer(atom('productId', ['polo-1']), { audience: 'signedIn' });
    assert.equal(dealHintAction(onePolo), 'add-same');
    assert.equal(dealHintAction(undefined), 'add-same');
  });

  it('half price and a free item from another product keep their wording', () => {
    const tees = offer(atom('categoryIds', ['t-shirts']));
    assert.equal(dealHintText(hint(1, { percent: 50 }), tees), 'Add 1 more item to get 1 at 50% off');
    assert.equal(
      dealHintText(hint(1, { samePool: false }), tees),
      'Buy 2, get 1 free: add the free item to your bag.',
    );
  });

  it('offer Shop page subtitle says which piece is free', () => {
    const base = offer({ anyOf: [] });
    assert.equal(offerShopSubtitle(base), 'The cheapest one is free.');
    const half = { ...base, reward: { ...base.reward, get: { quantity: 2, percent: 50 } } };
    assert.equal(offerShopSubtitle(half), 'The cheapest ones are 50% off.');
    const grip = { ...base, reward: { ...base.reward, getConditions: atom('productId', ['grip']) } };
    assert.equal(offerShopSubtitle(grip), null);
    assert.equal(offerShopSubtitle({ ...base, reward: { kind: 'freeShipping' } }), null);
  });
});

describe('Bundle price wording', () => {
  const rows = [
    { quantity: 3, price: 275 },
    { quantity: 2, price: 200 },
  ];
  const bundleOffer = { id: 'socks', title: 'Socks bundle', reward: { kind: 'bundlePrice', rows } };
  const bagBundle = (extra) => ({
    offerId: 'socks',
    title: 'Socks bundle',
    rows: [],
    units: 0,
    total: 0,
    saving: 0,
    lineIndex: 0,
    next: null,
    ...extra,
  });

  it('the Shop heading lists every row, smallest first', () => {
    assert.equal(offerShopSubtitle(bundleOffer), '2 for EGP 200 · 3 for EGP 275');
    assert.equal(
      offerShopSubtitle(bundleOffer, (egp) => `USD ${egp}`),
      '2 for USD 200 · 3 for USD 275',
    );
  });

  it('the bag strip names the rows used, and is empty with no piece in the bundle', () => {
    assert.equal(
      bundleStripTitle(bagBundle({ units: 2, rows: [{ quantity: 2, price: 200, count: 1 }] })),
      'Socks bundle · 2 for EGP 200',
    );
    assert.equal(
      bundleStripTitle(
        bagBundle({
          units: 7,
          rows: [
            { quantity: 3, price: 275, count: 2 },
            { quantity: 1, price: 125, count: 1 },
          ],
        }),
      ),
      'Socks bundle · 2 × 3 for EGP 275 + 1 for EGP 125',
    );
    assert.equal(bundleStripTitle(bagBundle({})), null);
  });

  it('the nudge says how many more reach the next row', () => {
    assert.equal(
      bundleNudgeText(bagBundle({ next: { missing: 1, quantity: 3, price: 275 } })),
      'Add 1 more to get 3 for EGP 275',
    );
    assert.equal(
      bundleNudgeText(bagBundle({ next: { missing: 2, quantity: 3, price: 275 } })),
      'Add 2 more to get 3 for EGP 275',
    );
    assert.equal(bundleNudgeText(bagBundle({})), null);
  });
});

describe('Bundle & Save wording (ATS-254)', () => {
  const slots = [
    { id: 'slot-1', name: 'Racket', quantity: 1, conditions: { anyOf: [] } },
    { id: 'slot-2', name: 'Bag', quantity: 1, conditions: { anyOf: [] } },
    { id: 'slot-3', name: 'Grip', quantity: 1, conditions: { anyOf: [] } },
  ];
  const setOffer = (setReward) => ({
    id: 'kit',
    title: 'Padel kit',
    reward: { kind: 'bundleSet', slots, setReward, maxSets: null },
  });
  const usd = (egp) => `USD ${egp}`;

  it('the Shop heading lists the groups and the saving', () => {
    assert.equal(
      offerShopSubtitle(setOffer({ type: 'percent', percent: 15 })),
      'Racket + Bag + Grip · Save 15%',
    );
    assert.equal(
      offerShopSubtitle(setOffer({ type: 'amount', amount: 500 }), usd),
      'Racket + Bag + Grip · Save USD 500',
    );
    assert.equal(
      offerShopSubtitle(setOffer({ type: 'total', price: 4500 })),
      'Racket + Bag + Grip · All for EGP 4,500',
    );
    assert.equal(
      offerShopSubtitle(setOffer({ type: 'cheapestFree' })),
      'Racket + Bag + Grip · Cheapest one free',
    );
    const two = { ...setOffer({ type: 'percent', percent: 10 }) };
    two.reward = { ...two.reward, slots: [slots[0], { ...slots[1], name: 'Ball', quantity: 2 }] };
    assert.equal(offerShopSubtitle(two), 'Racket + 2 × Ball · Save 10%');
    const broken = setOffer({ type: 'percent', percent: 10 });
    broken.reward = { ...broken.reward, slots: [] };
    assert.equal(offerShopSubtitle(broken), null);
  });

  it('the bag strip names the offer, and how many bundles with more than one', () => {
    assert.equal(bundleSetStripTitle({ title: 'Padel kit', sets: 1 }), 'Padel kit');
    assert.equal(bundleSetStripTitle({ title: 'Padel kit', sets: 2 }), 'Padel kit · 2 bundles');
    assert.equal(bundleSetStripTitle({ title: 'Padel kit', sets: 0 }), null);
  });

  it('the nudge names what is missing and what the set saves', () => {
    const bag = { sets: 0, missing: [{ slotId: 'slot-2', name: 'Bag', quantity: 1 }] };
    assert.equal(
      bundleSetNudgeText(bag, { type: 'amount', amount: 300 }),
      'Add a Bag to complete your bundle and save EGP 300',
    );
    assert.equal(
      bundleSetNudgeText(bag, { type: 'amount', amount: 300 }, usd),
      'Add a Bag to complete your bundle and save USD 300',
    );
    assert.equal(
      bundleSetNudgeText(bag, { type: 'percent', percent: 15 }),
      'Add a Bag to complete your bundle and save 15%',
    );
    assert.equal(
      bundleSetNudgeText(bag, { type: 'total', price: 4500 }),
      'Add a Bag to complete your bundle and get it for EGP 4,500',
    );
    assert.equal(
      bundleSetNudgeText(
        {
          sets: 1,
          missing: [
            { slotId: 'slot-1', name: 'Overgrip', quantity: 1 },
            { slotId: 'slot-2', name: 'Ball', quantity: 2 },
          ],
        },
        { type: 'cheapestFree' },
      ),
      'Add an Overgrip and 2 × Ball to complete another bundle and get the cheapest one free',
    );
    assert.equal(
      bundleSetNudgeText(
        { sets: 0, missing: [{ slotId: 'slot-2', name: 'Shorts', quantity: 1 }] },
        { type: 'percent', percent: 10 },
      ),
      'Add Shorts to complete your bundle and save 10%',
    );
    assert.equal(bundleSetNudgeText({ sets: 1, missing: [] }, { type: 'cheapestFree' }), null);
  });

  it('the nudge button names the one missing group', () => {
    assert.equal(bundleSetNudgeButton([{ name: 'Bag' }]), 'Choose Bag');
    assert.equal(bundleSetNudgeButton([{ name: 'Bag' }, { name: 'Grip' }]), 'Choose Items');
  });

  it('no nudge when the pieces own offers already save the amount off', () => {
    const amount = { type: 'amount', amount: 300 };
    assert.equal(bundleSetNudgeLoses(amount, [200, 150], 2), true);
    assert.equal(bundleSetNudgeLoses(amount, [200, 50], 2), false);
    // Only the smallest savings count: the set may use the other pieces.
    assert.equal(bundleSetNudgeLoses(amount, [400, 100, 50], 2), false);
    assert.equal(bundleSetNudgeLoses(amount, [400], 2), false);
    assert.equal(bundleSetNudgeLoses({ type: 'percent', percent: 15 }, [900, 900], 2), false);
  });
});

describe('Free shipping offer title abroad', () => {
  const freeShipping = { id: 'ship', title: 'Free shipping', reward: { kind: 'freeShipping' } };
  const percent = { id: 'sale', title: '20% off', reward: { kind: 'percentOff', percent: 20 } };

  it('shows a Free shipping offer to Egypt and to an unknown country, never abroad', () => {
    assert.equal(offerTitleVisible(freeShipping, 'EG'), true);
    assert.equal(offerTitleVisible(freeShipping, null), true);
    assert.equal(offerTitleVisible(freeShipping, 'GB'), false);
    assert.equal(offerTitleVisible(freeShipping, 'AE'), false);
  });

  it('leaves every other offer alone', () => {
    assert.equal(offerTitleVisible(percent, 'GB'), true);
  });
});

describe('top announcement bar offers (ATS-145)', () => {
  const NOW = new Date('2026-11-10T10:00:00Z');
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const offer = (id, extra = {}) => ({
    id,
    title: `Offer ${id}`,
    active: true,
    archived: false,
    visibility: 'public',
    audience: 'everyone',
    requiresCode: false,
    priority: 0,
    updatedAtMs: 0,
    schedule: { startsAt: null, endsAt: null, timezone: 'Africa/Cairo' },
    reward: { kind: 'percentOff', percent: 10 },
    banner: { show: true, text: null, countdown: 'hide', countdownDays: 7 },
    limits: { totalUses: null, perCustomer: null },
    ...extra,
  });
  const ids = (list) => list.map((o) => o.id);

  it('keeps live banner offers for everyone, highest priority then newest edit, at most 4', () => {
    const list = [
      offer('low', { priority: -5 }),
      offer('old', { priority: 10, updatedAtMs: 1 }),
      offer('new', { priority: 10, updatedAtMs: 2 }),
      offer('mid'),
      offer('extra', { priority: -10 }),
      offer('off', { banner: { show: false, text: null, countdown: 'hide', countdownDays: 7 } }),
      offer('legacy', { banner: undefined }),
      offer('signed-in', { audience: 'signedIn', priority: 50 }),
      offer('code', { requiresCode: true, priority: 50 }),
      offer('paused', { active: false, priority: 50 }),
      offer('archived', { archived: true, priority: 50 }),
      offer('later', { priority: 50, schedule: { startsAt: new Date(NOW.getTime() + HOUR), endsAt: null } }),
      offer('ended', { priority: 50, schedule: { startsAt: null, endsAt: NOW } }),
    ];
    assert.deepEqual(ids(bannerOffers(list, NOW, 'EG')), ['new', 'old', 'mid', 'low']);
  });

  it('never shows a Free shipping offer outside Egypt', () => {
    const ship = offer('ship', { reward: { kind: 'freeShipping' } });
    assert.deepEqual(ids(bannerOffers([ship], NOW, 'EG')), ['ship']);
    assert.deepEqual(ids(bannerOffers([ship], NOW, null)), ['ship']);
    assert.deepEqual(ids(bannerOffers([ship], NOW, 'GB')), []);
  });

  it('uses the banner text, or the customer title when it is empty', () => {
    assert.equal(bannerText(offer('a')), 'Offer a');
    const typed = offer('b', {
      banner: { show: true, text: 'Black Friday', countdown: 'hide', countdownDays: 7 },
    });
    assert.equal(bannerText(typed), 'Black Friday');
  });

  it('formats the countdown in days, or as a clock under 24 hours', () => {
    const ending = (ms, countdown = 'always', countdownDays = 7) =>
      offer('c', {
        schedule: { startsAt: null, endsAt: new Date(NOW.getTime() + ms) },
        banner: { show: true, text: null, countdown, countdownDays },
      });
    assert.equal(
      bannerCountdown(ending(2 * DAY + 14 * HOUR + 5 * 60_000 + 59_000), NOW),
      'Ends in 2d 14h 05m',
    );
    assert.equal(bannerCountdown(ending(5 * HOUR + 12 * 60_000 + 33_000), NOW), 'Ends in 05:12:33');
    assert.equal(bannerCountdown(ending(DAY), NOW), 'Ends in 1d 0h 00m');
    assert.equal(bannerCountdown(ending(0), NOW), null);
    assert.equal(bannerCountdown(ending(HOUR, 'hide'), NOW), null);
    assert.equal(
      bannerCountdown(
        offer('no-end', { banner: { show: true, text: null, countdown: 'always', countdownDays: 7 } }),
        NOW,
      ),
      null,
    );
  });

  it('"Only in the last N days" waits until N days or less are left', () => {
    const ending = (ms) =>
      offer('d', {
        schedule: { startsAt: null, endsAt: new Date(NOW.getTime() + ms) },
        banner: { show: true, text: null, countdown: 'lastDays', countdownDays: 3 },
      });
    assert.equal(bannerCountdown(ending(3 * DAY + 1000), NOW), null);
    assert.equal(bannerCountdown(ending(3 * DAY), NOW), 'Ends in 3d 0h 00m');
  });
});

describe("bag label for an item that earns another item's deal (ATS-148)", () => {
  it('turns a category name into a short singular word', () => {
    assert.equal(shortItemWord('Bags & gear'), 'bag');
    assert.equal(shortItemWord('Grips & protectors'), 'grip');
    assert.equal(shortItemWord('Socks'), 'socks');
    assert.equal(shortItemWord('Shorts'), 'shorts');
    assert.equal(shortItemWord('Hoodies'), 'hoodie');
    assert.equal(shortItemWord('Rackets'), 'racket');
    assert.equal(shortItemWord('Bottles'), 'bottle');
    assert.equal(shortItemWord('T-shirts & polos'), 't-shirt');
    assert.equal(shortItemWord('Accessories'), 'accessory');
    assert.equal(shortItemWord('Glasses'), 'glass');
    assert.equal(shortItemWord(''), null);
    assert.equal(shortItemWord(null), null);
    assert.equal(shortItemWord('Padel balls'), null);
  });

  it('says what the item gets the shopper, in at most 28 characters', () => {
    assert.equal(earnedItemLabel(100, 'bag'), 'Gets you the free bag');
    assert.equal(earnedItemLabel(100, 'grip'), 'Gets you the free grip');
    assert.equal(earnedItemLabel(50, 'bag'), 'Gets you 50% off the bag');
    assert.equal(earnedItemLabel(100, null), 'Gets you a free item');
    assert.equal(earnedItemLabel(50, null), 'Gets you 50% off an item');
    // Too long for one line: the generic wording.
    assert.equal(earnedItemLabel(50, 'tracksuit'), 'Gets you 50% off an item');
    assert.equal(earnedItemLabel(100, 'accessory'), 'Gets you the free accessory');
    assert.equal(earnedItemLabel(100, 'supercalifragilistic'), 'Gets you a free item');
    for (const label of [earnedItemLabel(100, 'tracksuit'), earnedItemLabel(99, 'bottle')]) {
      assert.ok(label.length <= EARNED_LABEL_MAX, label);
    }
  });
});

describe('bag notes when an offer stops applying (ATS-143)', () => {
  const line = { productId: 'tee', variantId: null, selection: { size: 'm' }, quantity: 1 };
  const bagKey = bagKeyOf([line], 'uid-1', cartLineKey);
  const lineKey = cartLineKey(line);
  const shirtKey = bagGiftKey(lineKey, 'gift-offer', 'gift-1');
  const state = (offers, gifts = []) => ({
    bagKey,
    offers: new Map(offers),
    gifts: new Map(gifts.map((key) => [key, { lineKey, name: 'Free shirt' }])),
  });
  const before = state([['autumn', 'Autumn Sale']], [shirtKey]);
  const step = (args) =>
    nextBagNotes({ notes: NO_BAG_NOTES, isLive: () => false, usedUp: new Set(), ...args });

  it('says nothing on the first look (first load, sign-in, sign-out)', () => {
    const notes = step({ previous: null, next: state([]) });
    assert.deepEqual(notes.offers, []);
    assert.deepEqual(notes.gifts, []);
  });

  it('notes an offer that was giving the bag something and has ended', () => {
    const notes = step({ previous: before, next: state([], [shirtKey]) });
    assert.deepEqual(notes.offers, [{ offerId: 'autumn', kind: 'ended', title: 'Autumn Sale' }]);
    assert.equal(offerNoteText(notes.offers[0]), 'The Autumn Sale offer has ended, so your total changed.');
  });

  it('says the shopper already used it when checkout was told so', () => {
    const notes = step({ previous: before, next: state([], [shirtKey]), usedUp: new Set(['autumn']) });
    assert.equal(notes.offers[0].kind, 'used');
    assert.equal(
      offerNoteText(notes.offers[0]),
      "You've already used the Autumn Sale offer, so your total changed.",
    );
  });

  it('says nothing for an offer that is still live (it only lost to a better one)', () => {
    const notes = step({
      previous: before,
      next: state([['bigger', 'Big Sale']], [shirtKey]),
      isLive: () => true,
    });
    assert.deepEqual(notes.offers, []);
  });

  it('never notes an offer that was never in the bag', () => {
    const notes = step({ previous: state([]), next: state([]) });
    assert.deepEqual(notes.offers, []);
  });

  it('says nothing when the bag itself changed', () => {
    const other = { ...state([]), bagKey: bagKeyOf([{ ...line, quantity: 2 }], 'uid-1', cartLineKey) };
    assert.deepEqual(step({ previous: before, next: other }).offers, []);
    // Signing out is a different bag too.
    assert.notEqual(bagKeyOf([line], null, cartLineKey), bagKey);
  });

  it('drops every note once the bag changes', () => {
    const notes = step({ previous: before, next: state([]) });
    const other = { ...state([]), bagKey: 'another-bag' };
    const after = nextBagNotes({
      notes,
      previous: state([]),
      next: other,
      isLive: () => false,
      usedUp: new Set(),
    });
    assert.deepEqual(after.offers, []);
    assert.deepEqual(after.gifts, []);
  });

  it('notes a free gift that can no longer be given, under its item', () => {
    const notes = step({ previous: before, next: state([['autumn', 'Autumn Sale']]) });
    assert.deepEqual(notes.gifts, [{ key: shirtKey, lineKey, name: 'Free shirt' }]);
    assert.equal(giftNoteText('Free shirt'), 'Your free shirt is no longer available.');
    assert.equal(giftNoteText(''), 'Your free gift is no longer available.');
  });

  it('keeps one note per offer and leaves a dismissed note away', () => {
    const notes = step({ previous: before, next: state([]) });
    const again = nextBagNotes({
      notes,
      previous: before,
      next: state([]),
      isLive: () => false,
      usedUp: new Set(),
    });
    assert.equal(again.offers.length, 1);
    const closed = dismissOfferNote(again, 'autumn');
    assert.deepEqual(closed.offers, []);
    // Checkout compares with its own (older) look: the closed note still stays away.
    const later = nextBagNotes({
      notes: closed,
      previous: before,
      next: state([]),
      isLive: () => false,
      usedUp: new Set(),
    });
    assert.deepEqual(later.offers, []);
  });

  it('drops a note when its offer applies again', () => {
    const notes = step({ previous: before, next: state([]) });
    const back = nextBagNotes({
      notes,
      previous: state([]),
      next: before,
      isLive: () => true,
      usedUp: new Set(),
    });
    assert.deepEqual(back.offers, []);
    assert.deepEqual(back.gifts, []);
  });

  it('keeps a gift note when another look still had the gift (older stock)', () => {
    // Checkout reloaded stock and lost the gift; the bag drawer still prices from its older look.
    const notes = step({ previous: before, next: state([['autumn', 'Autumn Sale']]) });
    const drawer = nextBagNotes({
      notes,
      previous: before,
      next: before,
      isLive: () => true,
      usedUp: new Set(),
    });
    assert.deepEqual(drawer.gifts, [{ key: shirtKey, lineKey, name: 'Free shirt' }]);
  });

  it('shows a new note even when another one goes in the same look', () => {
    const otherKey = bagGiftKey(lineKey, 'gift-offer', 'gift-2');
    const notes = step({ previous: state([], [shirtKey]), next: state([]) });
    assert.deepEqual(
      notes.gifts.map((note) => note.key),
      [shirtKey],
    );
    const after = nextBagNotes({
      notes,
      previous: state([], [otherKey]),
      next: state([], [shirtKey]),
      isLive: () => false,
      usedUp: new Set(),
    });
    assert.deepEqual(
      after.gifts.map((note) => note.key),
      [otherKey],
    );
  });

  it('keeps the same notes object when nothing changed', () => {
    const notes = step({ previous: before, next: state([]) });
    assert.equal(
      nextBagNotes({ notes, previous: state([]), next: state([]), isLive: () => false, usedUp: new Set() }),
      notes,
    );
  });

  it('notes a gift that was already sold out on the first look (ATS-164)', () => {
    const soldOut = {
      ...state([['autumn', 'Autumn Sale']]),
      unavailableGifts: new Map([[shirtKey, { lineKey, name: 'Free shirt' }]]),
    };
    const notes = step({ previous: null, next: soldOut });
    assert.deepEqual(notes.gifts, [{ key: shirtKey, lineKey, name: 'Free shirt' }]);
    // Still sold out: one note, same object.
    assert.equal(
      nextBagNotes({ notes, previous: soldOut, next: soldOut, isLive: () => true, usedUp: new Set() }),
      notes,
    );
    // Back in stock: the note goes.
    const back = nextBagNotes({
      notes,
      previous: soldOut,
      next: before,
      isLive: () => true,
      usedUp: new Set(),
    });
    assert.deepEqual(back.gifts, []);
    // Offer notes keep the "never on the first look" rule.
    assert.deepEqual(notes.offers, []);
  });

  it('reads plural gift names correctly', () => {
    assert.equal(giftNoteText('Free socks'), 'Your free socks are no longer available.');
    assert.equal(giftNoteText('Free shorts'), 'Your free shorts are no longer available.');
    assert.equal(giftNoteText('Free glass'), 'Your free glass is no longer available.');
    assert.equal(giftNoteText('Free shirt'), 'Your free shirt is no longer available.');
  });

  it('counts the free gifts in the Place Order refusal', () => {
    assert.equal(unavailableGiftsMessage(0), null);
    assert.equal(
      unavailableGiftsMessage(1),
      'One free gift in your bag is no longer available. Remove the item and choose another gift.',
    );
    assert.equal(
      unavailableGiftsMessage(2),
      '2 free gifts in your bag are no longer available. Remove those items and choose other gifts.',
    );
  });

  it('names an offer with no title in general words', () => {
    assert.equal(
      offerNoteText({ kind: 'ended', title: ' ' }),
      'An offer in your bag has ended, so your total changed.',
    );
    assert.equal(
      offerNoteText({ kind: 'used', title: '' }),
      "You've already used an offer in your bag, so your total changed.",
    );
  });
});

describe('onePerModel (one card per model in product lists)', () => {
  const p = (id, modelGroup, extra = {}) => ({ id, modelGroup, ...extra });

  it('keeps one product per model, where its first colour was', () => {
    const out = onePerModel([
      p('a-black', 'a'),
      p('b', null),
      p('a-red', 'a'),
      p('c-white', 'c'),
      p('c-black', 'c'),
    ]);
    assert.deepEqual(
      out.map((x) => x.id),
      ['a-black', 'b', 'c-white'],
    );
  });

  it('keeps every product without a model, blank models included', () => {
    const out = onePerModel([p('x', null), p('y', ''), p('z', '  ')]);
    assert.equal(out.length, 3);
  });

  it('shows an in-stock colour instead of an out-of-stock first colour', () => {
    const out = onePerModel([p('a-black', 'a', { stock: 0 }), p('b', null), p('a-red', 'a', { stock: 4 })]);
    assert.deepEqual(
      out.map((x) => x.id),
      ['a-red', 'b'],
    );
  });

  it('reads the inStock flag when there is no stock count, and keeps the first when none are in stock', () => {
    assert.equal(
      onePerModel([p('a1', 'a', { inStock: false }), p('a2', 'a', { inStock: true })])[0].id,
      'a2',
    );
    assert.equal(onePerModel([p('a1', 'a', { stock: 0 }), p('a2', 'a', { stock: 0 })])[0].id, 'a1');
  });
});

describe('navTargetPath (navigation links built from what they point at, ATS-246)', () => {
  const catalog = {
    categories: [
      { id: 'socks', slug: 'socks', name: 'Socks', published: true },
      { id: 'old-cat', slug: 'old-cat', name: 'Old', published: false },
    ],
    brands: [
      { id: 'nox', slug: 'nox', name: 'Nox', published: true },
      { id: 'siux', slug: 'siux-padel', name: 'Siux', published: false },
    ],
  };

  it('builds category, brand and page addresses', () => {
    assert.equal(navTargetPath({ kind: 'category', id: 'socks' }, catalog), '/category/socks');
    assert.equal(navTargetPath({ kind: 'brand', id: 'siux' }, catalog), '/brand/siux-padel');
    assert.equal(navTargetPath({ kind: 'page', page: 'sale' }, catalog), '/shop?onSale=1');
    assert.equal(navTargetPath({ kind: 'page', page: 'new-arrivals' }, catalog), '/shop?newArrivals=1');
    assert.equal(navTargetPath({ kind: 'page', page: 'brands' }, catalog), '/brands');
    assert.equal(navTargetPath({ kind: 'url', url: '/shop?sort=newest' }, catalog), '/shop?sort=newest');
  });

  it('uses Shop query names, with the brand name like the Brand filter', () => {
    const path = navTargetPath(
      { kind: 'shop', filters: { brand: 'nox', category: 'apparel', gender: 'women', onSale: true } },
      catalog,
    );
    assert.equal(path, '/shop?category=apparel&brand=Nox&gender=women&onSale=1');
    assert.equal(navTargetPath({ kind: 'shop', filters: {} }, catalog), '/shop');
  });

  it('reports hidden and missing targets', () => {
    assert.deepEqual(resolveNavTarget({ kind: 'category', id: 'old-cat' }, catalog), {
      path: '/category/old-cat',
      problem: 'hidden',
    });
    assert.deepEqual(resolveNavTarget({ kind: 'category', id: 'gone' }, catalog), {
      path: null,
      problem: 'missing',
    });
    assert.equal(resolveNavTarget({ kind: 'shop', filters: { brand: 'gone' } }, catalog).problem, 'missing');
  });

  it('turns an address back into a target, null when it cannot be matched (ATS-267)', () => {
    assert.deepEqual(navTargetFromPath('/category/socks', catalog), { kind: 'category', id: 'socks' });
    assert.deepEqual(navTargetFromPath('/category/apparel/socks/', catalog), {
      kind: 'category',
      id: 'socks',
    });
    assert.deepEqual(navTargetFromPath('/brand/siux-padel', catalog), { kind: 'brand', id: 'siux' });
    assert.deepEqual(navTargetFromPath('/shop?onSale=1', catalog), { kind: 'page', page: 'sale' });
    assert.deepEqual(navTargetFromPath('/shop', catalog), { kind: 'page', page: 'shop' });
    assert.deepEqual(navTargetFromPath('/shop?offer=summer', catalog), { kind: 'offer', id: 'summer' });
    assert.deepEqual(navTargetFromPath('/shop?brand=Nox&gender=women&onSale=1', catalog), {
      kind: 'shop',
      filters: { brand: 'nox', gender: 'women', onSale: true },
    });
    assert.deepEqual(navTargetFromPath('https://atteyastore.com/brand/nox', catalog), {
      kind: 'brand',
      id: 'nox',
    });
    assert.deepEqual(navTargetFromPath('https://instagram.com/atteya', catalog), {
      kind: 'url',
      url: 'https://instagram.com/atteya',
    });
    assert.equal(navTargetFromPath('/category/socks?onSale=1', catalog), null);
    assert.equal(navTargetFromPath('/shop?sort=newest', catalog), null);
    assert.equal(navTargetFromPath('/category/gone', catalog), null);
    assert.equal(navTargetFromPath('/shop?brand=Unknown', catalog), null);
    assert.equal(navTargetFromPath('  ', catalog), null);
  });

  it('reads a top-level Shop category with filters as Shop with filters', () => {
    const withApparel = {
      ...catalog,
      categories: [
        ...catalog.categories,
        { id: 'apparel', slug: 'apparel', name: 'Apparel', published: true },
      ],
    };
    assert.deepEqual(navTargetFromPath('/category/apparel?gender=men', withApparel), {
      kind: 'shop',
      filters: { category: 'apparel', gender: 'men' },
    });
  });

  it('opens an old typed address as its target, keeps Outside Links (ATS-267)', () => {
    assert.deepEqual(effectiveNavTarget(undefined, '/category/socks', catalog), {
      kind: 'category',
      id: 'socks',
    });
    assert.deepEqual(effectiveNavTarget({ kind: 'url', url: '/brand/nox' }, '/brand/nox', catalog), {
      kind: 'brand',
      id: 'nox',
    });
    assert.deepEqual(effectiveNavTarget({ kind: 'url', url: 'https://tiktok.com/@atteya' }, '', catalog), {
      kind: 'url',
      url: 'https://tiktok.com/@atteya',
    });
    assert.deepEqual(effectiveNavTarget({ kind: 'page', page: 'sale' }, '/old', catalog), {
      kind: 'page',
      page: 'sale',
    });
    assert.deepEqual(
      effectiveNavTarget({ kind: 'url', url: 'https://atteyastore.com/brand/nox' }, '', catalog),
      {
        kind: 'brand',
        id: 'nox',
      },
    );
    assert.equal(effectiveNavTarget(undefined, '/somewhere-else', catalog), null);
    assert.equal(effectiveNavTarget(undefined, '', catalog), null);
  });

  it('accepts only a full https address on another site as an Outside Link', () => {
    assert.equal(outsideLinkProblem('https://instagram.com/atteya'), null);
    assert.equal(outsideLinkProblem('https://wa.me/201000000000'), null);
    assert.equal(outsideLinkProblem('/shop'), 'Enter the full address, starting with https://.');
    assert.equal(
      outsideLinkProblem('http://instagram.com'),
      'Enter the full address, starting with https://.',
    );
    assert.equal(outsideLinkProblem('https://localhost'), 'Enter the full address, starting with https://.');
    assert.equal(outsideLinkProblem('https://atteyastore.com/shop'), 'Pick it from the list instead.');
    assert.equal(outsideLinkProblem('https://WWW.atteyastore.com'), 'Pick it from the list instead.');
    assert.equal(
      outsideLinkProblem('https://atteya-store--atteya-store-dev.europe-west4.hosted.app/shop'),
      'Pick it from the list instead.',
    );
    assert.equal(
      outsideLinkProblem(`https://instagram.com/${'a'.repeat(500)}`),
      'Use a shorter address (500 characters at most).',
    );
    assert.equal(isOutsideAddress('https://instagram.com'), true);
    assert.equal(isOutsideAddress('/shop'), false);
  });

  it('builds an offer link and flags an offer that is not running', () => {
    assert.equal(navTargetPath({ kind: 'offer', id: 'summer' }, catalog), '/shop?offer=summer');
    const withOffers = { ...catalog, offers: [{ id: 'summer', name: 'Summer Sale' }] };
    assert.equal(resolveNavTarget({ kind: 'offer', id: 'summer' }, withOffers).problem, null);
    assert.equal(resolveNavTarget({ kind: 'offer', id: 'old' }, withOffers).problem, 'ended');
    assert.equal(resolveNavTarget({ kind: 'offer', id: 'old' }, catalog).problem, null);
    assert.equal(navTargetName({ kind: 'offer', id: 'summer' }, withOffers), 'Summer Sale');
  });

  it('names a target for an empty label', () => {
    assert.equal(navTargetName({ kind: 'brand', id: 'nox' }, catalog), 'Nox');
    assert.equal(navTargetName({ kind: 'page', page: 'sale' }, catalog), 'Sale');
  });
});

describe('Shop tabs and Category filter from the category list (ATS-249)', () => {
  const categories = [
    { id: 'apparel', slug: 'apparel', name: 'Apparel', parentId: null, sortOrder: 20 },
    { id: 'rackets', slug: 'rackets', name: 'Rackets', parentId: null, sortOrder: 10 },
    { id: 'accessories', slug: 'accessories', name: 'Accessories', parentId: null, sortOrder: 30 },
    { id: 'bags', slug: 'bags', name: 'Bags & gear', parentId: 'accessories', sortOrder: 10 },
    { id: 'grips', slug: 'grips', name: 'Grips', parentId: 'accessories', sortOrder: 20 },
    { id: 'caps', slug: 'caps', name: 'Caps', parentId: null, sortOrder: 40, shopLabel: 'Hats & Caps' },
    { id: 'shoes', slug: 'shoes', name: 'Shoes', parentId: null, sortOrder: 50 },
    { id: 'hidden', slug: 'hidden', name: 'Hidden', parentId: null, sortOrder: 5, published: false },
  ];
  const counts = { apparel: 3, rackets: 4, accessories: 2, bags: 2, grips: 0, caps: 1, shoes: 0, hidden: 9 };

  it('names a tab by its saved name, else the built-in name, else the category name', () => {
    assert.equal(shopTabLabel({ id: 'rackets', name: 'Rackets' }), 'Padel');
    assert.equal(shopTabLabel({ id: 'rackets', name: 'Rackets', shopLabel: 'Rackets' }), 'Rackets');
    assert.equal(shopTabLabel({ id: 'caps', name: 'Caps', shopLabel: '  ' }), 'Caps');
    assert.equal(shopTabLabel({ id: 'caps', name: 'Caps', shopLabel: 'Hats & Caps' }), 'Hats & Caps');
  });

  it('lists All, then shown top-level categories with products in their order', () => {
    assert.deepEqual(
      shopTabsFrom(categories, counts).map((tab) => [tab.id, tab.label, tab.path]),
      [
        ['all', 'All', '/shop'],
        ['rackets', 'Padel', '/category/rackets'],
        ['apparel', 'Apparel', '/category/apparel'],
        ['accessories', 'Accessories', '/category/accessories'],
        ['caps', 'Hats & Caps', '/category/caps'],
      ],
    );
  });

  it('keeps every shown category while counts are unknown', () => {
    assert.deepEqual(
      shopTabsFrom(categories, null).map((tab) => tab.id),
      ['all', 'rackets', 'apparel', 'accessories', 'caps', 'shoes'],
    );
  });

  it('offers shown categories with products, each top level followed by its sub-categories', () => {
    assert.deepEqual(
      shopCategoryOptionsFrom(categories, counts).map((option) => [option.id, option.label]),
      [
        ['rackets', 'Padel'],
        ['apparel', 'Apparel'],
        ['accessories', 'Accessories'],
        ['bags', 'Bags'],
        ['caps', 'Hats & Caps'],
      ],
    );
  });

  it('matches a top-level category by address or a built-in one, never a sub-category', () => {
    assert.equal(shopCategoryIdForSlug('caps', categories), 'caps');
    assert.equal(shopCategoryIdForSlug('Shoes', categories), 'shoes');
    assert.equal(shopCategoryIdForSlug('padel', categories), null);
    assert.equal(
      shopCategoryIdForSlug('padel', [
        { id: 'padel', slug: 'padel', name: 'Padel', parentId: null, sortOrder: 60 },
      ]),
      'padel',
    );
    assert.equal(shopCategoryIdForSlug('apparel', []), 'apparel');
    assert.equal(shopCategoryIdForSlug('bags', categories), null);
    assert.equal(shopCategoryIdForSlug('unknown', categories), null);
    assert.equal(shopCategoryIdForSlug('', categories), null);
  });

  it('accepts any published or built-in category in ?category= and keeps a chosen empty one tickable', () => {
    const ids = shopCategoryFilterIds(categories);
    assert.equal(ids.has('shoes'), true);
    assert.equal(ids.has('grips'), true);
    assert.equal(ids.has('hidden'), false);
    assert.equal(ids.has('zzz'), false);
    const options = shopCategoryOptionsFrom(categories, counts);
    assert.deepEqual(withChosenCategories(options, ['shoes'], categories).at(-1), {
      id: 'shoes',
      label: 'Shoes',
      categoryId: 'shoes',
    });
    assert.equal(withChosenCategories(options, ['apparel'], categories), options);
  });

  it('builds a tab for an empty category so its page keeps its title and address', () => {
    assert.deepEqual(shopTabFor('shoes', categories), {
      id: 'shoes',
      label: 'Shoes',
      path: '/category/shoes',
    });
    assert.deepEqual(shopTabFor('all', categories), { id: 'all', label: 'All', path: '/shop' });
  });
});

describe('navigation columns that fill themselves (ATS-247)', () => {
  const sources = {
    brands: [
      { id: 'nox', slug: 'nox', name: 'Nox', sortOrder: 20, createdAtMs: 100 },
      { id: 'head', slug: 'head', name: 'Head', sortOrder: 10, createdAtMs: 300 },
      { id: 'siux', slug: 'siux', name: 'Siux', sortOrder: 30, createdAtMs: 200 },
    ],
    categories: [
      { id: 'apparel', slug: 'apparel', name: 'Apparel', parentId: null, sortOrder: 10 },
      { id: 'caps', slug: 'caps', name: 'Caps', parentId: 'apparel', sortOrder: 20 },
      { id: 'socks', slug: 'socks', name: 'Socks', parentId: 'apparel', sortOrder: 10 },
      { id: 'grips', slug: 'grips', name: 'Grips', parentId: 'accessories', sortOrder: 10 },
    ],
  };
  const none = () => false;

  it('lists every brand in its order, with the picked-target link shape', () => {
    const links = navAutoColumnLinks({ kind: 'brands' }, sources, none);
    assert.deepEqual(
      links.map((link) => link.path),
      ['/brand/head', '/brand/nox', '/brand/siux'],
    );
    assert.deepEqual(links[0], {
      label: 'Head',
      path: '/brand/head',
      target: { kind: 'brand', id: 'head' },
      isBrand: true,
    });
  });

  it('lists the newest brands first and stops at the limit', () => {
    const links = navAutoColumnLinks({ kind: 'newest-brands', limit: 2 }, sources, none);
    assert.deepEqual(
      links.map((link) => link.label),
      ['Head', 'Siux'],
    );
  });

  it('leaves out empty brands before the limit', () => {
    const links = navAutoColumnLinks({ kind: 'brands', limit: 2 }, sources, (path) => path === '/brand/head');
    assert.deepEqual(
      links.map((link) => link.label),
      ['Nox', 'Siux'],
    );
  });

  it('lists the sub-categories of one category in their order', () => {
    const links = navAutoColumnLinks({ kind: 'children', categoryId: 'apparel' }, sources, none);
    assert.deepEqual(links, [
      { label: 'Socks', path: '/category/socks', target: { kind: 'category', id: 'socks' } },
      { label: 'Caps', path: '/category/caps', target: { kind: 'category', id: 'caps' } },
    ]);
  });

  it('shows no sub-categories of a hidden category, and the Brands page ignores the limit', () => {
    assert.deepEqual(navAutoColumnLinks({ kind: 'children', categoryId: 'accessories' }, sources, none), []);
    assert.equal(
      navAutoColumnLinks({ kind: 'brands', limit: 1 }, sources, none, { noLimit: true }).length,
      3,
    );
  });

  it('replaces only auto columns and keeps the saved navigation as it was', () => {
    const saved = [
      {
        id: 'brands',
        label: 'Brands',
        megaMenu: [
          { title: 'Top', links: [{ label: 'Old', path: '/brand/old' }], auto: { kind: 'brands', limit: 1 } },
          { title: 'Hand', links: [{ label: 'Nox', path: '/brand/nox' }] },
        ],
      },
    ];
    const expanded = expandAutoColumns(saved, sources, none);
    assert.deepEqual(
      expanded[0].megaMenu[0].links.map((link) => link.label),
      ['Head'],
    );
    assert.equal(expanded[0].megaMenu[1], saved[0].megaMenu[1]);
    assert.equal(saved[0].megaMenu[0].links[0].label, 'Old');
    assert.equal(navNeedsBrands(saved), true);
    assert.equal(navNeedsBrands([{ id: 'x', label: 'X', megaMenu: [{ links: [] }] }]), false);
  });

  it('reads times from numbers, dates, strings and Timestamps', () => {
    assert.equal(timeToMs(5), 5);
    assert.equal(timeToMs(new Date(10)), 10);
    assert.equal(timeToMs('1970-01-01T00:00:00.020Z'), 20);
    assert.equal(timeToMs({ toMillis: () => 30 }), 30);
    assert.equal(timeToMs(null), 0);
  });
});

describe('deleted built-in categories and brands (ATS-265)', () => {
  const deleted = new Set(['bottles', 'nox', 'apparel']);

  it('reads the saved list, ignoring anything that is not an id', () => {
    assert.deepEqual(readDeletedBuiltInIds(['bottles', 2, 'Bad Id']), ['bottles']);
    assert.deepEqual(readDeletedBuiltInIds(null), []);
  });

  it('knows which store addresses open a deleted built-in', () => {
    assert.equal(pathOpensDeletedBuiltIn('/category/accessories/bottles', deleted), true);
    assert.equal(pathOpensDeletedBuiltIn('/category/apparel?sort=newest', deleted), true);
    assert.equal(pathOpensDeletedBuiltIn('/brand/nox', deleted), true);
    assert.equal(pathOpensDeletedBuiltIn('/category/accessories', deleted), false);
    assert.equal(pathOpensDeletedBuiltIn('/shop?category=apparel', deleted), false);
    assert.equal(pathOpensDeletedBuiltIn(undefined, deleted), false);
  });

  it('stops opening a deleted built-in Shop category', () => {
    assert.equal(shopCategoryIdForSlug('apparel', []), 'apparel');
    assert.equal(shopCategoryIdForSlug('apparel', [], deleted), null);
    assert.equal(shopCategoryIdForSlug('rackets', [], deleted), 'rackets');
  });
});

describe('removeFromMenu (ATS-265)', () => {
  const menu = [
    {
      id: 'accessories',
      label: 'ACCESSORIES',
      path: '/category/accessories',
      target: { kind: 'category', id: 'accessories' },
      megaMenu: [
        {
          title: 'Gear',
          links: [
            {
              label: 'Bottles',
              path: '/category/accessories/bottles',
              target: { kind: 'category', id: 'bottles' },
            },
            { label: 'Old bottles link', path: '/category/accessories/bottles' },
            { label: 'Bags', path: '/category/accessories/bags', target: { kind: 'category', id: 'bags' } },
          ],
        },
        { title: 'Inside', links: [], auto: { kind: 'children', categoryId: 'bottles' } },
      ],
    },
    { id: 'nox', label: 'NOX', path: '/brand/nox', target: { kind: 'brand', id: 'nox' } },
  ];

  it('takes out links, typed addresses and a sub-categories column for a deleted category', () => {
    const { next, changed } = removeFromMenu(menu, {
      kind: 'category',
      id: 'bottles',
      address: '/category/accessories/bottles',
    });
    assert.equal(changed, true);
    const columns = next[0].megaMenu;
    assert.deepEqual(
      columns[0].links.map((link) => link.label),
      ['Bags'],
    );
    assert.equal(columns[1].auto, undefined);
    assert.equal(next.length, 2);
  });

  it('drops a menu that only opened the deleted brand', () => {
    const { next, changed } = removeFromMenu(menu, { kind: 'brand', id: 'nox', address: '/brand/nox' });
    assert.equal(changed, true);
    assert.deepEqual(
      next.map((item) => item.id),
      ['accessories'],
    );
  });

  it('takes out a Shop with Filters link for the deleted brand', () => {
    const withFilters = [
      {
        id: 'padel',
        label: 'PADEL',
        megaMenu: [
          {
            title: 'Shop',
            links: [
              {
                label: 'Nox Rackets',
                path: '/shop?brand=Nox',
                target: { kind: 'shop', filters: { brand: 'nox' } },
              },
              { label: 'Sale', path: '/shop?onSale=1', target: { kind: 'shop', filters: { onSale: true } } },
            ],
          },
        ],
      },
    ];
    const { next } = removeFromMenu(withFilters, { kind: 'brand', id: 'nox', address: '/brand/nox' });
    assert.deepEqual(
      next[0].megaMenu[0].links.map((link) => link.label),
      ['Sale'],
    );
  });

  it('changes nothing when the menu never mentioned it', () => {
    const result = removeFromMenu(menu, { kind: 'brand', id: 'siux', address: '/brand/siux' });
    assert.equal(result.changed, false);
    assert.equal(result.next, menu);
  });
});

describe('category and brand pages never open empty (ATS-268)', () => {
  const published = [
    { id: 'apparel', slug: 'apparel', parentId: null },
    { id: 'hoodies', slug: 'hoodies', parentId: 'apparel' },
    { id: 't-shirts', slug: 't-shirts', parentId: 'apparel' },
    { id: 'padel', slug: 'padel', parentId: null },
  ];
  const counts = {
    categories: { apparel: 12, hoodies: 0, 't-shirts': 12, padel: 0, caps: 3, rackets: 4 },
    brands: { nox: 5, head: 0, wilson: 2 },
  };
  const none = new Set();
  const category = (slug, subSlug = null, extra = {}) =>
    decideCategoryPage({ slug, subSlug, published, counts, deletedBuiltInIds: none, ...extra });

  it('opens a shown category with live products', () => {
    assert.deepEqual(category('apparel', 't-shirts'), { kind: 'ok' });
    assert.deepEqual(category('apparel'), { kind: 'ok' });
  });

  it('sends an empty sub-category to its main category', () => {
    assert.deepEqual(category('apparel', 'hoodies'), { kind: 'redirect', path: '/category/apparel' });
    assert.deepEqual(category('hoodies'), { kind: 'redirect', path: '/category/apparel' });
  });

  it('sends a hidden sub-category to its main category and a hidden main one to Shop', () => {
    assert.deepEqual(category('apparel', 'caps'), { kind: 'redirect', path: '/category/apparel' });
    assert.deepEqual(category('rackets'), { kind: 'redirect', path: '/shop' });
  });

  it('sends an empty main category to Shop', () => {
    assert.deepEqual(category('padel'), { kind: 'redirect', path: '/shop' });
  });

  it('shows Page Not Found for a deleted or unknown category', () => {
    assert.deepEqual(category('apparel', 'scarves'), { kind: 'missing' });
    assert.deepEqual(category('rackets', null, { deletedBuiltInIds: new Set(['rackets']) }), {
      kind: 'missing',
    });
  });

  it('checks the main category in the address and uses the real parent', () => {
    assert.deepEqual(category('gone', 't-shirts'), { kind: 'missing' });
    assert.deepEqual(category('padel', 'hoodies'), { kind: 'redirect', path: '/category/apparel' });
    const emptyMain = { ...counts, categories: { ...counts.categories, apparel: 0 } };
    assert.deepEqual(category('apparel', 'hoodies', { counts: emptyMain }), {
      kind: 'redirect',
      path: '/shop',
    });
  });

  it('decides nothing while the built-in category list stands in', () => {
    assert.deepEqual(category('apparel', 'hoodies', { published: null }), { kind: 'ok' });
  });

  it('decides nothing without counts or for pages that are not categories', () => {
    assert.deepEqual(category('apparel', 'hoodies', { counts: null }), { kind: 'ok' });
    assert.deepEqual(category('sale'), { kind: 'ok' });
    assert.deepEqual(category('apparel', 'new'), { kind: 'ok' });
  });

  const brands = [
    { id: 'nox', slug: 'nox' },
    { id: 'head', slug: 'head' },
  ];
  const brand = (slug, extra = {}) =>
    decideBrandPage({ slug, published: brands, counts, deletedBuiltInIds: none, ...extra });

  it('opens a brand with live products and sends an empty or hidden one to Shop', () => {
    assert.deepEqual(brand('nox'), { kind: 'ok' });
    assert.deepEqual(brand('head'), { kind: 'redirect', path: '/shop' });
    assert.deepEqual(brand('wilson'), { kind: 'redirect', path: '/shop' });
  });

  it('shows Page Not Found for a deleted brand and decides nothing when brands could not load', () => {
    assert.deepEqual(brand('babolat'), { kind: 'missing' });
    assert.deepEqual(brand('babolat', { published: null }), { kind: 'ok' });
  });
});
