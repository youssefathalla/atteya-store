import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyStockReturn, nextStockAfterDemand } from '../../lib/orders/decrement-order-stock.js';
import { orderEmailsForWrite } from '../../lib/email/order-email-events.js';
import { readOrderForEmail } from '../../lib/email/order-email-model.js';
import {
  allowedStatusMoves,
  canMoveStatus,
  cleanCancelReason,
  orderStockTaken,
  parseSetOrderStatusRequest,
  RETURN_BLOCKS_STEP_BACK_MESSAGE,
  returnBlocksStepBack,
  stampsClearedBy,
  stockMoveFor,
} from '../../lib/store/order-status.js';

describe('allowed status moves', () => {
  it('follows the table for Cash on Delivery and InstaPay', () => {
    for (const paymentMethod of ['cash-on-delivery', 'instapay']) {
      assert.deepEqual(allowedStatusMoves({ status: 'pending', paymentMethod }), ['confirmed', 'cancelled']);
      assert.deepEqual(allowedStatusMoves({ status: 'confirmed', paymentMethod }), [
        'shipped',
        'pending',
        'cancelled',
      ]);
      assert.deepEqual(allowedStatusMoves({ status: 'shipped', paymentMethod }), ['delivered', 'confirmed']);
      assert.deepEqual(allowedStatusMoves({ status: 'delivered', paymentMethod }), ['shipped']);
      assert.deepEqual(allowedStatusMoves({ status: 'cancelled', paymentMethod }), []);
    }
  });

  it('card orders: no move while pending or failed, never cancelled or back to waiting', () => {
    const paymentMethod = 'paymob';
    assert.deepEqual(allowedStatusMoves({ status: 'pending', paymentMethod }), []);
    assert.deepEqual(allowedStatusMoves({ status: 'failed', paymentMethod }), []);
    assert.deepEqual(allowedStatusMoves({ status: 'confirmed', paymentMethod }), ['shipped']);
    assert.deepEqual(allowedStatusMoves({ status: 'shipped', paymentMethod }), ['delivered', 'confirmed']);
    assert.deepEqual(allowedStatusMoves({ status: 'delivered', paymentMethod }), ['shipped']);
    assert.equal(canMoveStatus({ status: 'confirmed', paymentMethod }, 'cancelled'), false);
    assert.equal(canMoveStatus({ status: 'confirmed', paymentMethod }, 'pending'), false);
  });

  it('never skips a step forward', () => {
    const order = { status: 'pending', paymentMethod: 'instapay' };
    assert.equal(canMoveStatus(order, 'shipped'), false);
    assert.equal(canMoveStatus(order, 'delivered'), false);
    assert.equal(canMoveStatus({ status: 'confirmed', paymentMethod: 'instapay' }, 'delivered'), false);
    assert.equal(canMoveStatus({ status: 'delivered', paymentMethod: 'instapay' }, 'cancelled'), false);
  });

  it('legacy and unknown orders get no moves', () => {
    assert.deepEqual(
      allowedStatusMoves({ status: 'pending', paymentMethod: 'international-bank-transfer' }),
      [],
    );
  });
});

describe('returns block the step back from Delivered (ATS-297)', () => {
  const request = (status: string) => ({ id: `r-${status}`, status, hasRefund: true, items: [] });

  it('refuses Back to Shipped while a request is open or finished', () => {
    for (const status of ['requested', 'approved', 'received', 'refund-sent', 'something-new']) {
      for (const paymentMethod of ['cash-on-delivery', 'instapay', 'paymob']) {
        const order = { status: 'delivered', paymentMethod, returns: [request(status)] };
        assert.deepEqual(allowedStatusMoves(order), [], `${paymentMethod} ${status}`);
        assert.equal(canMoveStatus(order, 'shipped'), false);
        assert.equal(returnBlocksStepBack(order), true);
      }
    }
    const mixed = {
      status: 'delivered',
      paymentMethod: 'instapay',
      returns: [request('rejected'), request('received')],
    };
    assert.equal(canMoveStatus(mixed, 'shipped'), false);
  });

  it('allows it again once every request is Rejected or Cancelled', () => {
    const order = {
      status: 'delivered',
      paymentMethod: 'cash-on-delivery',
      returns: [request('rejected'), request('cancelled')],
    };
    assert.deepEqual(allowedStatusMoves(order), ['shipped']);
    assert.equal(returnBlocksStepBack(order), false);
  });

  it('an order with no returns moves and returns stock as before', () => {
    for (const returns of [undefined, [], null, 'junk']) {
      const order = { status: 'delivered', paymentMethod: 'instapay', returns };
      assert.deepEqual(allowedStatusMoves(order), ['shipped']);
      assert.equal(returnBlocksStepBack(order), false);
    }
    assert.deepEqual(allowedStatusMoves({ status: 'confirmed', paymentMethod: 'instapay', returns: [] }), [
      'shipped',
      'pending',
      'cancelled',
    ]);
    assert.equal(stockMoveFor('cancelled', true), 'return');
  });

  it('only Delivered orders are held back, and the message is the agreed one', () => {
    const order = { status: 'shipped', paymentMethod: 'instapay', returns: [request('approved')] };
    assert.equal(returnBlocksStepBack(order), false);
    assert.equal(
      RETURN_BLOCKS_STEP_BACK_MESSAGE,
      'This order has a return or exchange. Finish or reject it first, then change the order.',
    );
  });
});

describe('stock is taken once and returned once', () => {
  it('Confirmed takes stock only when it is not already taken', () => {
    assert.equal(stockMoveFor('confirmed', false), 'take');
    assert.equal(stockMoveFor('confirmed', true), 'none');
  });

  it('Cancelled and back to Waiting for Payment return stock only when it was taken', () => {
    assert.equal(stockMoveFor('cancelled', true), 'return');
    assert.equal(stockMoveFor('pending', true), 'return');
    assert.equal(stockMoveFor('cancelled', false), 'none');
    assert.equal(stockMoveFor('pending', false), 'none');
    assert.equal(stockMoveFor('shipped', true), 'none');
    assert.equal(stockMoveFor('delivered', true), 'none');
  });

  it('reads stockDecrementedAt, and counts older confirmed orders as taken', () => {
    assert.equal(orderStockTaken({ status: 'pending' }), false);
    assert.equal(orderStockTaken({ status: 'confirmed', stockDecrementedAt: 'x' }), true);
    assert.equal(orderStockTaken({ status: 'confirmed', stockDecrementedAt: null }), false);
    assert.equal(orderStockTaken({ status: 'pending', stockDecrementedAt: null }), false);
    assert.equal(orderStockTaken({ status: 'confirmed' }), true);
    assert.equal(orderStockTaken({ status: 'shipped' }), true);
    assert.equal(orderStockTaken({ status: 'cancelled' }), false);
  });

  it('a full round trip (confirm, step back, confirm, cancel) leaves stock where it started', () => {
    const options = [{ key: 'size', values: [{ id: 'm' }, { id: 'l' }] }];
    const demand = { kind: 'sized', bySize: { m: 2 } } as const;
    let product = { stock: 5, stockBySize: { m: 3, l: 2 }, options };
    let order: Record<string, unknown> = { status: 'pending' };

    const step = (target: 'confirmed' | 'pending' | 'cancelled') => {
      const move = stockMoveFor(target, orderStockTaken(order));
      if (move === 'take') {
        const next = nextStockAfterDemand(product, demand);
        product = { stock: next.stock, stockBySize: next.stockBySize as { m: number; l: number }, options };
        order = { status: target, stockDecrementedAt: 'now' };
      } else if (move === 'return') {
        const next = applyStockReturn(product, demand)!.next;
        product = { stock: next.stock, stockBySize: next.stockBySize as { m: number; l: number }, options };
        order = { status: target, stockDecrementedAt: null };
      } else {
        order = { ...order, status: target };
      }
      return move;
    };

    assert.equal(step('confirmed'), 'take');
    assert.deepEqual(product.stockBySize, { m: 1, l: 2 });
    assert.equal(step('pending'), 'return');
    assert.deepEqual(product.stockBySize, { m: 3, l: 2 });
    assert.equal(step('confirmed'), 'take');
    assert.equal(step('cancelled'), 'return');
    assert.deepEqual(product.stockBySize, { m: 3, l: 2 });
    assert.equal(product.stock, 5);
  });

  it('returns flat stock, skips a size the product no longer has, and leaves unset stock alone', () => {
    assert.deepEqual(
      applyStockReturn(
        { stock: 1, stockBySize: undefined, options: [] },
        {
          kind: 'flat',
          quantity: 2,
        },
      ),
      { next: { stock: 3, stockBySize: null, inStock: true }, skipped: 0 },
    );
    const options = [{ key: 'size', values: [{ id: 'm' }] }];
    const result = applyStockReturn(
      { stock: 0, stockBySize: { m: 0 }, options },
      { kind: 'sized', bySize: { m: 1, xl: 2 } },
    );
    assert.deepEqual(result, { next: { stock: 1, stockBySize: { m: 1 }, inStock: true }, skipped: 2 });
    assert.equal(
      applyStockReturn(
        { stock: undefined, stockBySize: undefined, options: [] },
        {
          kind: 'flat',
          quantity: 1,
        },
      ),
      null,
    );
  });
});

describe('step back stamps', () => {
  it('clears the stamp of the step it leaves', () => {
    assert.deepEqual(stampsClearedBy('delivered', 'shipped'), ['deliveredAt']);
    assert.deepEqual(stampsClearedBy('shipped', 'confirmed'), ['shippedAt']);
    assert.deepEqual(stampsClearedBy('confirmed', 'pending'), ['confirmedAt']);
    assert.deepEqual(stampsClearedBy('confirmed', 'shipped'), []);
  });
});

describe('setOrderStatus request', () => {
  it('accepts a staff status and keeps the reason only for Cancelled', () => {
    assert.deepEqual(
      parseSetOrderStatusRequest({ orderId: 'abc', status: 'cancelled', reason: '  Out of stock  ' }),
      {
        orderId: 'abc',
        status: 'cancelled',
        reason: 'Out of stock',
      },
    );
    assert.deepEqual(parseSetOrderStatusRequest({ orderId: 'abc', status: 'shipped', reason: 'x' }), {
      orderId: 'abc',
      status: 'shipped',
      reason: null,
    });
    assert.equal(
      parseSetOrderStatusRequest({ orderId: 'abc', status: 'cancelled', reason: '   ' })?.reason,
      null,
    );
  });

  it('refuses Payment Failed, unknown statuses, bad ids and long reasons', () => {
    assert.equal(parseSetOrderStatusRequest({ orderId: 'abc', status: 'failed' }), null);
    assert.equal(parseSetOrderStatusRequest({ orderId: 'abc', status: 'returned' }), null);
    assert.equal(parseSetOrderStatusRequest({ orderId: 'a/b', status: 'shipped' }), null);
    assert.equal(
      parseSetOrderStatusRequest({ orderId: 'abc', status: 'cancelled', reason: 'x'.repeat(301) }),
      null,
    );
    assert.equal(cleanCancelReason('x'.repeat(400))?.length, 300);
  });
});

describe('status emails from the trigger', () => {
  const doc = (status: string) => ({
    status,
    paymentMethod: 'cash-on-delivery',
    customerEmail: 'a@b.co',
    shipping: { fullName: 'A', line1: 'x', city: 'Cairo', postalCode: '', country: 'EG', phone: '010' },
    pricing: { lines: [{ productId: 'p', quantity: 1, unitEgp: 100 }], subtotalEgp: 100, totalEgp: 100 },
  });
  const read = (status: string) => readOrderForEmail('order1', doc(status));

  it('first Shipped and first Delivered send, steps back send nothing', () => {
    assert.deepEqual(orderEmailsForWrite(read('confirmed'), read('shipped')), ['order-shipped']);
    assert.deepEqual(orderEmailsForWrite(read('shipped'), read('delivered')), ['order-delivered']);
    assert.deepEqual(orderEmailsForWrite(read('delivered'), read('shipped')), []);
    assert.deepEqual(orderEmailsForWrite(read('shipped'), read('confirmed')), []);
  });
});
