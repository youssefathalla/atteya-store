import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { orderSearchTerms, orderSearchTokens, type OrderSearchSource } from './order-search.js';

const source = (overrides: Partial<OrderSearchSource> = {}): OrderSearchSource => ({
  orderId: 'A1b2C3xyz987',
  fullName: 'Ahmed Samir',
  phone: '01012345678',
  email: 'ahmed.samir@example.com',
  ...overrides,
});

/** True when every word staff typed is in the order's saved words (what the Orders page checks). */
const finds = (typed: string, order: OrderSearchSource): boolean => {
  const tokens = new Set(orderSearchTokens(order));
  const terms = orderSearchTerms(typed);
  return terms.length > 0 && terms.every((term) => tokens.has(term));
};

describe('order search', () => {
  it('finds an English name by any start of each word, in any case', () => {
    assert.ok(finds('ahmed', source()));
    assert.ok(finds('AHM', source()));
    assert.ok(finds('Ahmed Sam', source()));
    assert.ok(!finds('Ahmed Hany', source()));
  });

  it('finds an Arabic name whatever the hamza, taa marbuta, alef maqsura or marks', () => {
    const order = source({ fullName: 'أحمد مصطفى' });
    assert.ok(finds('احمد', order));
    assert.ok(finds('إحمد', order));
    assert.ok(finds('أَحْمَد', order));
    assert.ok(finds('مصطفي', order));
    assert.ok(finds('مص', order));
    assert.ok(finds('فاطمه', source({ fullName: 'فاطمة علي' })));
  });

  it('does not match across scripts', () => {
    assert.ok(!finds('Ahmed', source({ fullName: 'أحمد', email: 'shopper@example.com' })));
  });

  it('finds a phone typed local, international, with spaces, Arabic digits or only the end', () => {
    assert.ok(finds('01012345678', source()));
    assert.ok(finds('+20 101 234 5678', source()));
    assert.ok(finds('٠١٠١٢٣٤٥٦٧٨', source()));
    assert.ok(finds('5678', source()));
    assert.ok(finds('0101', source()));
    assert.ok(!finds('9999', source()));
  });

  it('finds the order number with or without # and the email', () => {
    assert.ok(finds('#A1B2C3', source()));
    assert.ok(finds('a1b2', source()));
    assert.ok(finds('ahmed.samir@example.com', source()));
    assert.ok(finds('Ahmed.Samir@Example.com', source()));
  });

  it('ignores one-letter words and empty input', () => {
    assert.deepEqual(orderSearchTerms('  '), []);
    assert.deepEqual(orderSearchTerms('a'), []);
  });

  it('keeps the saved list small', () => {
    const long = source({ fullName: 'Abdelrahman Mohamed Abdelaziz Elsayed Mostafa Ibrahim Abdelhamid' });
    assert.ok(orderSearchTokens(long).length <= 150);
  });
});
