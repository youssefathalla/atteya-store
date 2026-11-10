import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
