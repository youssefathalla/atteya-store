import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled code (`npm test` builds first).
import {
  assertCurrentSelection,
  ITEM_CHANGED,
  staleSelectionKeys,
} from '../../lib/orders/order-selection.js';

const BAG_BEFORE = [
  { key: 'gift', label: 'Free shirt', values: [{ id: 'polo', label: 'POLO WHITE' }] },
  { key: 'size', label: 'Size', values: [{ id: 'm', label: 'M' }] },
  { key: 'gift', label: 'Free socks', values: [{ id: 'on', label: 'ON BLACK' }] },
];

describe('staleSelectionKeys', () => {
  it('finds nothing while the product still has every chosen option', () => {
    assert.deepEqual(staleSelectionKeys(BAG_BEFORE, { gift: 'polo', size: 'm' }), []);
  });

  it('lists choices for options the product no longer has', () => {
    assert.deepEqual(staleSelectionKeys([], { gift: 'polo', size: 'm' }), ['gift', 'size']);
    assert.deepEqual(staleSelectionKeys(undefined, { size: 'm' }), ['size']);
  });

  it('keeps an option that has no values yet', () => {
    assert.deepEqual(staleSelectionKeys([{ key: 'size', values: [] }], { size: 'm' }), []);
  });
});

describe('assertCurrentSelection', () => {
  it('lets a line with no choices through on a product with no options', () => {
    assert.doesNotThrow(() => assertCurrentSelection([], {}));
  });

  it('refuses a bag line saved before the bag lost its gift and size options', () => {
    assert.throws(
      () => assertCurrentSelection([], { gift: 'polo', size: 'm' }),
      (error: unknown) =>
        error instanceof Error &&
        (error as { code?: string }).code === 'failed-precondition' &&
        error.message === ITEM_CHANGED,
    );
  });
});
