import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toDisplayAmount } from '../../lib/offers/engine/currency.js';
import { payInEntry, payInFor } from '../../lib/orders/pay-in.js';

const USD = { code: 'USD', factor: 0.0285 };

describe('payInEntry', () => {
  const currencies = {
    USD: { factor: 0.0285 },
    EUR: { factor: 0.026 },
    LBP: { factor: 2500 },
    GBP: { factor: 0 },
  };

  it('uses the currency checkout showed when it has a factor', () => {
    assert.deepEqual(payInEntry('EUR', currencies), { code: 'EUR', factor: 0.026 });
  });

  it('falls back to USD for a missing, unknown, unusable or EGP currency', () => {
    for (const requested of [null, 'XYZ', 'GBP', 'LBP']) {
      assert.deepEqual(payInEntry(requested, currencies), USD, String(requested));
    }
  });

  it('keeps EGP when checkout showed pounds, with no conversion', () => {
    assert.deepEqual(payInEntry('EGP', {}), { code: 'EGP', factor: 1 });
    assert.deepEqual(
      payInFor(
        [{ unitEgp: 1000, quantity: 2, lineDisplay: 2000 }],
        { priceEgp: 900 },
        { code: 'EGP', factor: 1 },
      ),
      {
        currency: 'EGP',
        amount: 2900,
      },
    );
  });

  it('is null when not even USD has a factor', () => {
    assert.equal(payInEntry('EUR', {}), null);
  });
});

describe('payInFor', () => {
  it('adds up each line and the shipping fee the way checkout does', () => {
    const lines = [
      { unitEgp: 1850, quantity: 2, lineDisplay: 3700 },
      // A Buy X Get Y line is converted as a whole.
      { unitEgp: 900, quantity: 2, lineDisplay: 900, fullEgp: 1800 },
      // Free gifts add nothing.
      {
        unitEgp: 0,
        quantity: 1,
        lineDisplay: 0,
        gift: { offerId: 'o', giftId: 'g', giftName: 'Free', forLine: 0 },
      },
    ];
    const expected = toDisplayAmount(1850, USD) * 2 + toDisplayAmount(900, USD) + toDisplayAmount(950, USD);
    assert.deepEqual(payInFor(lines, { priceEgp: 950 }, USD), { currency: 'USD', amount: expected });
  });

  it('keeps 3 decimals for KWD and free shipping adds 0', () => {
    const kwd = { code: 'KWD', factor: 0.0062 };
    const result = payInFor([{ unitEgp: 1000, quantity: 3, lineDisplay: 3000 }], { priceEgp: 0 }, kwd);
    assert.equal(result.currency, 'KWD');
    assert.equal(result.amount, Number((toDisplayAmount(1000, kwd) * 3).toFixed(3)));
  });
});
