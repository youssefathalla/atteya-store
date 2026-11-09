import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateOrderStockDemand,
  applyStockDemand,
  nextStockAfterDemand,
  parseOrderStockLines,
} from './decrement-order-stock.js';

describe('aggregateOrderStockDemand', () => {
  it('sums flat lines per product', () => {
    const demand = aggregateOrderStockDemand([
      { productId: 'a', quantity: 2, selection: {} },
      { productId: 'a', quantity: 1, selection: {} },
      { productId: 'b', quantity: 3, selection: {} },
    ]);
    assert.deepEqual(demand.get('a'), { kind: 'flat', quantity: 3 });
    assert.deepEqual(demand.get('b'), { kind: 'flat', quantity: 3 });
  });

  it('sums sized lines per product and size', () => {
    const demand = aggregateOrderStockDemand([
      { productId: 'a', quantity: 2, selection: { size: 'm' } },
      { productId: 'a', quantity: 1, selection: { size: 'm' } },
      { productId: 'a', quantity: 4, selection: { size: 'l' } },
    ]);
    assert.deepEqual(demand.get('a'), {
      kind: 'sized',
      bySize: { m: 3, l: 4 },
    });
  });

  it('rejects mixed flat and sized demand on one product', () => {
    assert.throws(() =>
      aggregateOrderStockDemand([
        { productId: 'a', quantity: 1, selection: { size: 'm' } },
        { productId: 'a', quantity: 1, selection: {} },
      ]),
    );
  });
});

describe('nextStockAfterDemand', () => {
  it('decrements flat stock', () => {
    const next = nextStockAfterDemand(
      { stock: 10, stockBySize: null, options: [] },
      { kind: 'flat', quantity: 3 },
    );
    assert.deepEqual(next, { stock: 7, stockBySize: null, inStock: true });
  });

  it('decrements per-size stock and keeps sibling sizes', () => {
    const next = nextStockAfterDemand(
      {
        stock: 15,
        stockBySize: { m: 10, l: 5 },
        options: [
          {
            key: 'size',
            values: [
              { id: 'm', label: 'M' },
              { id: 'l', label: 'L' },
            ],
          },
        ],
      },
      { kind: 'sized', bySize: { m: 3 } },
    );
    assert.equal(next.stock, 12);
    assert.deepEqual(next.stockBySize, { m: 7, l: 5 });
    assert.equal(next.inStock, true);
  });

  it('rejects insufficient size stock', () => {
    assert.throws(() =>
      nextStockAfterDemand(
        {
          stock: 2,
          stockBySize: { m: 2 },
          options: [{ key: 'size', values: [{ id: 'm', label: 'M' }] }],
        },
        { kind: 'sized', bySize: { m: 5 } },
      ),
    );
  });

  it('sets inStock false when flat stock reaches zero', () => {
    const next = nextStockAfterDemand(
      { stock: 2, stockBySize: null, options: [] },
      { kind: 'flat', quantity: 2 },
    );
    assert.deepEqual(next, { stock: 0, stockBySize: null, inStock: false });
  });

  it('decrements flat stock when size option exists but stockBySize map is missing', () => {
    // Matches EasyOrders tracked products with sizes and no variants / no map.
    const next = nextStockAfterDemand(
      {
        stock: 10,
        stockBySize: null,
        options: [
          {
            key: 'size',
            values: [
              { id: 'm', label: 'M' },
              { id: 'l', label: 'L' },
            ],
          },
        ],
      },
      { kind: 'sized', bySize: { m: 2, l: 1 } },
    );
    assert.deepEqual(next, { stock: 7, stockBySize: null, inStock: true });
  });
});

describe('applyStockDemand with allowShortfall', () => {
  const sized = {
    stock: 3,
    stockBySize: { s: 1, m: 2 },
    options: [{ key: 'size', values: [{ id: 's' }, { id: 'm' }] }],
  };

  it('floors a short size at 0 and reports it', () => {
    const result = applyStockDemand(sized, { kind: 'sized', bySize: { s: 3 } }, { allowShortfall: true });
    assert.equal(result.short, true);
    assert.deepEqual(result.next.stockBySize, { s: 0, m: 2 });
    assert.equal(result.next.stock, 2);
  });

  it('floors flat stock at 0 and reports it', () => {
    const result = applyStockDemand(
      { stock: 1, stockBySize: undefined, options: [] },
      { kind: 'flat', quantity: 4 },
      { allowShortfall: true },
    );
    assert.equal(result.short, true);
    assert.equal(result.next.stock, 0);
    assert.equal(result.next.inStock, false);
  });

  it('is not short when stock covers the demand', () => {
    const result = applyStockDemand(sized, { kind: 'sized', bySize: { m: 2 } }, { allowShortfall: true });
    assert.equal(result.short, false);
    assert.deepEqual(result.next.stockBySize, { s: 1, m: 0 });
  });

  it('still throws without allowShortfall', () => {
    assert.throws(() => nextStockAfterDemand(sized, { kind: 'sized', bySize: { s: 3 } }));
  });
});

describe('parseOrderStockLines', () => {
  it('reads productId, quantity and string selections', () => {
    const lines = parseOrderStockLines({
      pricing: { lines: [{ productId: 'p1', quantity: 2, selection: { size: 'm', bad: 1 } }] },
    });
    assert.deepEqual(lines, [{ productId: 'p1', quantity: 2, selection: { size: 'm' } }]);
  });

  it('rejects an order without lines', () => {
    assert.throws(() => parseOrderStockLines({ pricing: { lines: [] } }));
  });
});
