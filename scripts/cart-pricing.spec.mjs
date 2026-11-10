import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canCheckout,
  cartSubtotalDisplay,
  lineDisplayAmount,
} from '../src/app/core/services/cart/cart-pricing.ts';
import {
  addCartLine,
  clampLineQuantity,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  mergeCartLines,
} from '../src/app/core/services/cart/cart.model.ts';
import {
  endedOfferIdFrom,
  offerToLeaveOut,
  priceChangedFrom,
  serverClockFrom,
  serverTotalsToShow,
  totalChangedFrom,
} from '../src/app/core/services/orders/order-refusal.ts';
import {
  canShopOffer,
  dealHintAction,
  dealHintText,
  offerShopSubtitle,
  offerTitleVisible,
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
    assert.deepEqual(first, { leaveOut: null, lastChangedOfferId: 'deal-1' });
    assert.deepEqual(offerToLeaveOut(changed, first.lastChangedOfferId), {
      leaveOut: 'deal-1',
      lastChangedOfferId: null,
    });
    assert.deepEqual(offerToLeaveOut({ details: { changedOfferId: 'deal-2' } }, 'deal-1'), {
      leaveOut: null,
      lastChangedOfferId: 'deal-2',
    });
    assert.deepEqual(offerToLeaveOut({ details: { endedOfferId: 'deal-3' } }, 'deal-1'), {
      leaveOut: 'deal-3',
      lastChangedOfferId: null,
    });
    assert.deepEqual(offerToLeaveOut(new Error('offline'), 'deal-1'), {
      leaveOut: null,
      lastChangedOfferId: null,
    });
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
