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
import { endedOfferIdFrom, offerToLeaveOut } from '../src/app/core/services/orders/order-refusal.ts';

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
    assert.equal(endedOfferIdFrom({ code: 'functions/failed-precondition', details: { endedOfferId: 'deal-1' } }), 'deal-1');
  });

  it('never leaves out an offer from "Prices in your bag changed" (changedOfferId)', () => {
    assert.equal(endedOfferIdFrom({ code: 'functions/failed-precondition', details: { changedOfferId: 'deal-1' } }), null);
    assert.equal(endedOfferIdFrom(new Error('offline')), null);
    assert.equal(endedOfferIdFrom(null), null);
  });

  it('leaves out a changed offer only when the same one is refused twice in a row', () => {
    const changed = { details: { changedOfferId: 'deal-1' } };
    const first = offerToLeaveOut(changed, null);
    assert.deepEqual(first, { leaveOut: null, lastChangedOfferId: 'deal-1' });
    assert.deepEqual(offerToLeaveOut(changed, first.lastChangedOfferId), { leaveOut: 'deal-1', lastChangedOfferId: null });
    assert.deepEqual(offerToLeaveOut({ details: { changedOfferId: 'deal-2' } }, 'deal-1'), { leaveOut: null, lastChangedOfferId: 'deal-2' });
    assert.deepEqual(offerToLeaveOut({ details: { endedOfferId: 'deal-3' } }, 'deal-1'), { leaveOut: 'deal-3', lastChangedOfferId: null });
    assert.deepEqual(offerToLeaveOut(new Error('offline'), 'deal-1'), { leaveOut: null, lastChangedOfferId: null });
  });
});
