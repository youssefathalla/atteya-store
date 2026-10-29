import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canCheckout,
  cartSubtotalDisplay,
  lineDisplayAmount,
} from '../src/app/core/services/cart/cart-pricing.ts';

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
