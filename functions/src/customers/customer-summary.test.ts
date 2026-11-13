import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  accountFieldsChanged,
  buildCustomerSummary,
  customerAccountFrom,
  customerEmailOf,
  customerIdFromEmail,
  customerOrderFrom,
  customerSearchTokens,
  emailLookupValues,
  orderCounts,
  orderFieldsChanged,
  orderIsCompleted,
  type CustomerOrderInput,
} from '../../lib/customers/customer-summary.js';

const order = (over: Partial<CustomerOrderInput> = {}): CustomerOrderInput => ({
  id: 'A1B2C3xyz',
  status: 'pending',
  totalEgp: 1000,
  createdAtMs: 1_000,
  fullName: 'Mariam Adel',
  phone: '01012345678',
  city: 'Cairo',
  country: 'EG',
  ...over,
});

const account = {
  uid: 'uid-1',
  name: 'Mariam',
  phone: '01099999999',
  city: 'Giza',
  country: 'EG',
  marketingOptIn: true,
  emailVerified: true,
  createdAtMs: 500,
};

describe('customer id and email', () => {
  it('uses sha256 of the trimmed, lower-cased email', () => {
    const expected = createHash('sha256').update('mariam@gmail.com').digest('hex');
    assert.equal(customerIdFromEmail('Mariam@Gmail.com '), expected);
    assert.equal(customerIdFromEmail('mariam@gmail.com'), expected);
  });

  it('accepts only an email with one @ and text on both sides', () => {
    assert.equal(customerEmailOf(' Mariam@Gmail.com '), 'mariam@gmail.com');
    assert.equal(customerEmailOf('no-at'), null);
    assert.equal(customerEmailOf('@gmail.com'), null);
    assert.equal(customerEmailOf('a@b@c'), null);
    assert.equal(customerEmailOf('a@'), null);
    assert.equal(customerEmailOf(null), null);
  });

  it('looks orders up by the lower-cased email and its other spellings only', () => {
    assert.deepEqual(emailLookupValues('mariam@gmail.com', ['Mariam@Gmail.com ', 'other@gmail.com', 3]), [
      'mariam@gmail.com',
      'Mariam@Gmail.com ',
    ]);
  });
});

describe('which orders count', () => {
  it('counts every order except Payment Failed', () => {
    for (const status of ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']) {
      assert.equal(orderCounts(status), true, status);
    }
    assert.equal(orderCounts('failed'), false);
  });

  it('counts money only for Confirmed, Shipped and Delivered', () => {
    assert.deepEqual(
      ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'failed'].map(orderIsCompleted),
      [false, true, true, true, false, false],
    );
  });
});

describe('buildCustomerSummary', () => {
  it('adds up orders by status', () => {
    const summary = buildCustomerSummary(
      'mariam@gmail.com',
      [
        order({ id: 'o1', status: 'pending', totalEgp: 500, createdAtMs: 4_000 }),
        order({ id: 'o2', status: 'confirmed', totalEgp: 1000, createdAtMs: 3_000 }),
        order({ id: 'o3', status: 'delivered', totalEgp: 2001, createdAtMs: 2_000 }),
        order({ id: 'o4', status: 'cancelled', totalEgp: 700, createdAtMs: 1_500 }),
        order({ id: 'o5', status: 'failed', totalEgp: 900, createdAtMs: 9_000 }),
      ],
      null,
    );
    assert.ok(summary);
    assert.equal(summary.orderCount, 4);
    assert.equal(summary.openOrderCount, 1);
    assert.equal(summary.cancelledOrderCount, 2);
    assert.equal(summary.spentEgp, 3001);
    assert.equal(summary.averageOrderEgp, 1501);
    assert.equal(summary.firstOrderAtMs, 1_500);
    assert.equal(summary.lastOrderAtMs, 4_000);
    assert.equal(summary.createdAtMs, 1_500);
    assert.equal(summary.hasAccount, false);
    assert.equal(summary.uid, null);
    assert.equal(summary.marketingOptIn, false);
  });

  it('keeps a customer whose only order failed, with 0 orders and no dates', () => {
    const summary = buildCustomerSummary('a@b.com', [order({ status: 'failed', createdAtMs: 7 })], null);
    assert.ok(summary);
    assert.equal(summary.orderCount, 0);
    assert.equal(summary.spentEgp, 0);
    assert.equal(summary.averageOrderEgp, 0);
    assert.equal(summary.firstOrderAtMs, null);
    assert.equal(summary.lastOrderAtMs, null);
    assert.equal(summary.createdAtMs, 7);
  });

  it('gives the same totals however often it runs (rebuilt, never added to)', () => {
    const orders = [order({ status: 'confirmed' }), order({ id: 'b', status: 'shipped', totalEgp: 50 })];
    assert.deepEqual(
      buildCustomerSummary('a@b.com', orders, account),
      buildCustomerSummary('a@b.com', [...orders].reverse(), account),
    );
  });

  it('takes contact details from the newest order, else the account', () => {
    const fromOrder = buildCustomerSummary(
      'a@b.com',
      [
        order({ fullName: 'Old Name', createdAtMs: 1 }),
        order({ id: 'n', fullName: 'New Name', city: 'Alexandria', createdAtMs: 2 }),
      ],
      account,
    );
    assert.equal(fromOrder?.name, 'New Name');
    assert.equal(fromOrder?.city, 'Alexandria');

    const fromAccount = buildCustomerSummary('a@b.com', [], account);
    assert.equal(fromAccount?.name, 'Mariam');
    assert.equal(fromAccount?.phone, '01099999999');
    assert.equal(fromAccount?.city, 'Giza');
    assert.equal(fromAccount?.orderCount, 0);
    assert.equal(fromAccount?.hasAccount, true);
    assert.equal(fromAccount?.uid, 'uid-1');
    assert.equal(fromAccount?.marketingOptIn, true);
    assert.equal(fromAccount?.emailVerified, true);
    assert.equal(fromAccount?.createdAtMs, 500);
  });

  it('returns null when there are no orders and no account', () => {
    assert.equal(buildCustomerSummary('a@b.com', [], null), null);
  });

  it('saves the lower-cased email and remembers other spellings', () => {
    const summary = buildCustomerSummary(' Mariam@Gmail.com', [order()], null, [
      'Mariam@Gmail.com ',
      'mariam@gmail.com',
    ]);
    assert.equal(summary?.email, 'mariam@gmail.com');
    assert.deepEqual(summary?.emailVariants, ['Mariam@Gmail.com ']);
  });
});

describe('customerSearchTokens', () => {
  it('has the name, phone, email and short order numbers', () => {
    const tokens = customerSearchTokens('مريم Adel', '+20 101 234 5678', 'mariam@gmail.com', [
      'A1B2C3xyz',
      'ZZZZZZ1',
    ]);
    for (const word of [
      'مر',
      'مريم',
      'ad',
      'adel',
      '01012345678',
      '201012345678',
      '5678',
      'mariam@gmail.com',
      'ma',
      'a1b2c3',
      'zzzzzz',
    ]) {
      assert.ok(tokens.includes(word), word);
    }
  });

  it('keeps at most 50 order numbers', () => {
    const ids = Array.from({ length: 60 }, (_, index) => `x${String(index).padStart(5, '0')}`);
    const tokens = customerSearchTokens('', '', 'a@b.com', ids);
    assert.ok(tokens.includes('x00049'));
    assert.ok(!tokens.includes('x00050'));
  });
});

describe('reading docs', () => {
  it('reads an order doc', () => {
    const input = customerOrderFrom(
      'id1',
      {
        status: 'confirmed',
        pricing: { totalEgp: 1500 },
        shipping: { fullName: ' Ali ', phone: '010', city: 'Cairo', country: 'eg' },
      },
      42,
    );
    assert.deepEqual(input, {
      id: 'id1',
      status: 'confirmed',
      totalEgp: 1500,
      createdAtMs: 42,
      fullName: 'Ali',
      phone: '010',
      city: 'Cairo',
      country: 'EG',
    });
    assert.equal(customerOrderFrom('x', {}, null).totalEgp, 0);
  });

  it('reads an account doc, falling back to the saved address', () => {
    const input = customerAccountFrom(
      'u',
      { address: { fullName: 'Ali', phone: '010', city: 'Giza', country: 'EG' } },
      false,
      null,
    );
    assert.equal(input.name, 'Ali');
    assert.equal(input.phone, '010');
    assert.equal(input.marketingOptIn, false);
  });

  it('notices only account changes the customer shows', () => {
    assert.equal(accountFieldsChanged({ name: 'a' }, { name: 'a', updatedAt: 1 }), false);
    assert.equal(accountFieldsChanged({ name: 'a' }, { name: 'b' }), true);
    assert.equal(accountFieldsChanged({ marketingOptIn: false }, { marketingOptIn: true }), true);
    assert.equal(accountFieldsChanged({ address: { city: 'a' } }, { address: { city: 'b' } }), true);
  });

  it('rebuilds only for order writes that change what the customer shows', () => {
    const base = {
      status: 'pending',
      customerEmail: 'a@b.com',
      pricing: { totalEgp: 100 },
      shipping: { city: 'Cairo' },
    };
    assert.equal(orderFieldsChanged(undefined, base), true);
    assert.equal(orderFieldsChanged(base, undefined), true);
    assert.equal(
      orderFieldsChanged(base, { ...base, searchTokens: ['x'], claimedAt: 1, updatedAt: 2 }),
      false,
    );
    assert.equal(orderFieldsChanged(base, { ...base, status: 'confirmed' }), true);
    assert.equal(orderFieldsChanged(base, { ...base, pricing: { totalEgp: 250, lines: [] } }), true);
    assert.equal(orderFieldsChanged(base, { ...base, shipping: { city: 'Giza' } }), true);
    assert.equal(orderFieldsChanged(base, { ...base, customerEmail: 'c@d.com' }), true);
    const at = (ms: number) => ({ toMillis: () => ms });
    assert.equal(orderFieldsChanged({ ...base, createdAt: at(1) }, { ...base, createdAt: at(1) }), false);
    assert.equal(orderFieldsChanged({ ...base, createdAt: at(1) }, { ...base, createdAt: at(2) }), true);
  });
});
