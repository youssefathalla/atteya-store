import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPublicCurrencyDoc, parseMarkup } from '../../lib/intl/currency-config.js';

// Only passed through to the doc body, so any object stands in for a Firestore Timestamp here.
const AT = { seconds: 1, nanoseconds: 0 } as never;

describe('buildPublicCurrencyDoc', () => {
  it('folds the markup into one factor per currency', () => {
    const doc = buildPublicCurrencyDoc(40, { USD: 0.02, EUR: 0.0185 }, AT);
    assert.equal(doc.base, 'EGP');
    assert.equal(doc.ratesUpdatedAt, AT);
    assert.ok(Math.abs(doc.currencies['USD']!.factor - 0.028) < 1e-12);
    assert.ok(Math.abs(doc.currencies['EUR']!.factor - 0.0259) < 1e-12);
  });

  it('leaves out EGP, bad codes and rates that are not above 0', () => {
    const doc = buildPublicCurrencyDoc(
      0,
      { EGP: 1, usd: 0.02, GBP: 0, JPY: -1, CHF: Number.NaN, CAD: 0.03 },
      AT,
    );
    assert.deepEqual(Object.keys(doc.currencies), ['CAD']);
    assert.equal(doc.currencies['CAD']!.factor, 0.03);
  });

  it('uses the rate unchanged when the markup is 0', () => {
    assert.equal(buildPublicCurrencyDoc(0, { USD: 0.02 }, AT).currencies['USD']!.factor, 0.02);
  });
});

describe('parseMarkup', () => {
  it('accepts 0 to 200 with at most one decimal place', () => {
    assert.equal(parseMarkup(40), 40);
    assert.equal(parseMarkup(12.5), 12.5);
    assert.equal(parseMarkup(0), 0);
    assert.equal(parseMarkup(200), 200);
  });

  it('refuses anything else', () => {
    for (const value of [-1, 200.1, 12.34, Number.NaN, '40', null, undefined]) {
      assert.equal(parseMarkup(value), null);
    }
  });
});
