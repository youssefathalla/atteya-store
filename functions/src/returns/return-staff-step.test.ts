import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyStockMoves,
  approvePlan,
  mergeItemChoices,
  parseApprove,
  parseRefundSent,
  parseReject,
  parseReceive,
  readSavedStep,
  readStaffItems,
  receiveStep,
  rejectKeptItems,
  rejectStep,
  rejectStockFor,
  ReturnStepError,
  savedStep,
  withSentPieces,
  type StepProduct,
} from '../../lib/returns/return-staff-step.js';
import {
  hasReturnHoldingPieces,
  piecesLeft,
  readReturnOrderLines,
  readReturnSummaries,
  withReturnStatus,
} from '../../lib/store/returns.js';
import { allowedStatusMoves, canMoveStatus, returnBlocksMove } from '../../lib/store/order-status.js';

const SIZES = [
  {
    key: 'size',
    label: 'Size',
    values: [
      { id: 'm', label: 'M' },
      { id: 'l', label: 'L' },
    ],
  },
];

function sized(m: number, l: number, name = 'Club Shorts'): StepProduct {
  return { stock: m + l, stockBySize: { m, l }, options: SIZES, name };
}

function products(entries: Record<string, StepProduct | null>): Map<string, StepProduct | null> {
  return new Map(Object.entries(entries));
}

const base = { productId: 'shorts', selection: { size: 'm' }, name: 'Club Shorts', quantity: 1 };

function item(extra: Record<string, unknown>) {
  return readStaffItems([{ ...base, ...extra }]);
}

/** Runs Approve then Item Received on fresh stock and returns the counts after each. */
function run(
  rawItem: Record<string, unknown>,
  stock: Record<string, StepProduct | null>,
  sent: { itemIndex: number; productId: string; size: string | null }[] = [],
  sellable = new Map<number, boolean>(),
) {
  const live = products(stock);
  const items = withSentPieces(item(rawItem), sent, live);
  const approve = approvePlan(items).approve;
  const afterApprove = applyStockMoves(live, approve, { short: 'refuse' });
  const merged = new Map(live);
  for (const [id, next] of afterApprove.next) {
    const old = merged.get(id)!;
    merged.set(id, { ...old, stock: next.stock, stockBySize: next.stockBySize });
  }
  const received = receiveStep(items, sellable);
  const afterReceived = applyStockMoves(merged, received.step, { short: 'floor' });
  return { approve, afterApprove, received, afterReceived };
}

describe('staff steps: every row of the stock plan', () => {
  it('Different Size: new piece −1 at Approve, returned piece +1 at Item Received', () => {
    const r = run(
      { kind: 'different-size', newProductId: 'shorts', newSelection: { size: 'l' } },
      { shorts: sized(2, 3) },
    );
    assert.deepEqual(r.afterApprove.next.get('shorts')?.stockBySize, { m: 2, l: 2 });
    assert.deepEqual(r.afterReceived.next.get('shorts')?.stockBySize, { m: 3, l: 2 });
  });

  it('Different Colour: the other product −1 at Approve, the bought one +1 at Item Received', () => {
    const r = run(
      { kind: 'different-colour', newProductId: 'shorts-white', newSelection: { size: 'm' } },
      { shorts: sized(0, 0), 'shorts-white': sized(1, 0, 'White Shorts') },
    );
    assert.deepEqual(r.afterApprove.next.get('shorts-white')?.stockBySize, { m: 0, l: 0 });
    assert.equal(r.afterApprove.next.has('shorts'), false);
    assert.deepEqual(r.afterReceived.next.get('shorts')?.stockBySize, { m: 1, l: 0 });
  });

  it('an exchange piece that can not be sold again stays off the shelf', () => {
    const r = run(
      { kind: 'different-size', newProductId: 'shorts', newSelection: { size: 'l' } },
      { shorts: sized(2, 3) },
      [],
      new Map([[0, false]]),
    );
    assert.equal(r.received.step.putBack.length, 0);
  });

  it('Return It: nothing at Approve, piece +1 at Item Received', () => {
    const r = run({ kind: 'return', reason: 'didnt-fit', refund: true }, { shorts: sized(1, 1) });
    assert.equal(r.afterApprove.next.size, 0);
    assert.deepEqual(r.afterReceived.next.get('shorts')?.stockBySize, { m: 2, l: 1 });
  });

  it('Damaged · Send Another: same piece −1 at Approve, nothing back by default', () => {
    const r = run({ kind: 'damaged', wants: 'send-another' }, { shorts: sized(1, 1) });
    assert.deepEqual(r.afterApprove.next.get('shorts')?.stockBySize, { m: 0, l: 1 });
    assert.equal(r.received.items[0]?.canBeSoldAgain, false);
    assert.equal(r.afterReceived.next.size, 0);
  });

  it('Damaged · Refund: nothing at Approve, nothing back by default, +1 when staff switch it on', () => {
    const off = run({ kind: 'damaged', wants: 'refund' }, { shorts: sized(1, 1) });
    assert.equal(off.afterApprove.next.size, 0);
    assert.equal(off.afterReceived.next.size, 0);
    const on = run({ kind: 'damaged', wants: 'refund' }, { shorts: sized(1, 1) }, [], new Map([[0, true]]));
    assert.deepEqual(on.afterReceived.next.get('shorts')?.stockBySize, { m: 2, l: 1 });
  });

  it('Wrong Item Sent · Send the Right One: sent piece −1 at Approve, sent piece +1 at Item Received', () => {
    const r = run(
      { kind: 'wrong-item', wants: 'send-right-one' },
      { shorts: sized(1, 1), tee: sized(4, 4, 'Club Tee') },
      [{ itemIndex: 0, productId: 'tee', size: 'l' }],
      new Map([[0, false]]),
    );
    assert.deepEqual(r.afterApprove.next.get('tee')?.stockBySize, { m: 4, l: 3 });
    assert.equal(r.afterApprove.next.has('shorts'), false, 'ordered piece +1 then −1 = no change');
    // No switch for wrong items: the sent piece always goes back, even if false was sent.
    assert.deepEqual(r.afterReceived.next.get('tee')?.stockBySize, { m: 4, l: 4 });
  });

  it('Wrong Item Sent · Refund: sent piece −1 and ordered piece +1 at Approve, sent piece +1 at Item Received', () => {
    const r = run(
      { kind: 'wrong-item', wants: 'refund', refund: true },
      { shorts: sized(1, 1), tee: sized(4, 4, 'Club Tee') },
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
    );
    assert.deepEqual(r.afterApprove.next.get('tee')?.stockBySize, { m: 3, l: 4 });
    assert.deepEqual(r.afterApprove.next.get('shorts')?.stockBySize, { m: 2, l: 1 });
    assert.deepEqual(r.afterReceived.next.get('tee')?.stockBySize, { m: 4, l: 4 });
  });

  it('a returned free gift goes back on the shelf at Item Received', () => {
    const items = readStaffItems([
      { ...base, kind: 'return', reason: 'changed-mind', refund: true },
      {
        productId: 'socks',
        selection: {},
        name: 'Socks',
        quantity: 2,
        kind: 'return',
        gift: true,
        autoGift: true,
      },
    ]);
    const live = products({
      shorts: sized(0, 0),
      socks: { stock: 5, stockBySize: undefined, options: [], name: 'Socks' },
    });
    const received = receiveStep(items, new Map());
    const moved = applyStockMoves(live, received.step, { short: 'floor' });
    assert.equal(moved.next.get('socks')?.stock, 7);
    assert.deepEqual(moved.next.get('shorts')?.stockBySize, { m: 1, l: 0 });
  });
});

describe('staff steps: refusals, undo and double clicks', () => {
  it('a sold-out new piece refuses with the size name and nothing changes', () => {
    const live = products({ shorts: sized(2, 0) });
    const step = approvePlan(
      item({ kind: 'different-size', newProductId: 'shorts', newSelection: { size: 'l' } }),
    ).approve;
    assert.throws(
      () => applyStockMoves(live, step, { short: 'refuse' }),
      (error: unknown) =>
        error instanceof ReturnStepError &&
        error.message ===
          'Size L is sold out. Ask the customer to pick another size or switch this item to a refund.',
    );
  });

  it('a wrong item needs the piece we sent, with a size the product has', () => {
    const live = products({ shorts: sized(1, 1), tee: sized(1, 1, 'Club Tee') });
    const items = item({ kind: 'wrong-item', wants: 'refund' });
    assert.throws(() => withSentPieces(items, [], live), /Choose what we sent instead of Club Shorts/);
    assert.throws(
      () => withSentPieces(items, [{ itemIndex: 0, productId: 'tee', size: 'xl' }], live),
      /Choose the size we sent of Club Tee/,
    );
    assert.throws(
      () => withSentPieces(items, [{ itemIndex: 0, productId: 'gone', size: 'm' }], live),
      /no longer exists/,
    );
  });

  it('Reject after Approve undoes exactly what Approve moved, floored at 0', () => {
    const live = products({ shorts: sized(1, 1) });
    const items = readStaffItems([
      { ...base, kind: 'different-size', newProductId: 'shorts', newSelection: { size: 'l' } },
    ]);
    const plan = approvePlan(items);
    // Saved on the request at Approve and read back on Reject.
    const saved = JSON.parse(JSON.stringify(savedStep(plan.reject)));
    const undo = rejectStep(saved, savedStep(plan.approve));
    const afterApprove = applyStockMoves(live, plan.approve, { short: 'refuse' });
    assert.deepEqual(afterApprove.next.get('shorts')?.stockBySize, { m: 1, l: 0 });
    const after = applyStockMoves(products({ shorts: sized(1, 0) }), undo, { short: 'floor' });
    assert.deepEqual(after.next.get('shorts')?.stockBySize, { m: 1, l: 1 });
    // A request approved before rejectStock was saved undoes what Approve moved.
    assert.deepEqual(rejectStep(undefined, savedStep(plan.approve)), undo);
  });

  it('legacy undo of a Wrong Item Refund stops at 0 instead of blocking the reject', () => {
    const live = products({ shorts: sized(1, 1), tee: sized(4, 4, 'Club Tee') });
    const items = withSentPieces(
      item({ kind: 'wrong-item', wants: 'refund' }),
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
      live,
    );
    const undo = rejectStep(undefined, JSON.parse(JSON.stringify(savedStep(approvePlan(items).approve))));
    const sold = applyStockMoves(products({ shorts: sized(0, 1), tee: sized(3, 4) }), undo, {
      short: 'floor',
    });
    assert.deepEqual(sold.next.get('shorts')?.stockBySize, { m: 0, l: 1 });
  });

  /** Approve then Reject (with the saved `rejectStock`), returning the counts after each. */
  function approveThenReject(wants: string) {
    const live = products({ shorts: sized(5, 5), tee: sized(5, 5, 'Club Tee') });
    const items = withSentPieces(
      item({ kind: 'wrong-item', wants }),
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
      live,
    );
    const plan = approvePlan(items);
    const approved = applyStockMoves(live, plan.approve, { short: 'refuse' });
    const merged = new Map(live);
    for (const [id, next] of approved.next) {
      merged.set(id, { ...merged.get(id)!, stock: next.stock, stockBySize: next.stockBySize });
    }
    const saved = JSON.parse(JSON.stringify(savedStep(plan.reject)));
    const rejected = applyStockMoves(merged, rejectStep(saved, savedStep(approved.applied)), {
      short: 'floor',
    });
    const count = (id: string) =>
      rejected.next.get(id)?.stockBySize ?? approved.next.get(id)?.stockBySize ?? live.get(id)?.stockBySize;
    return { shorts: count('shorts'), tee: count('tee') };
  }

  it('Reject after Approve of Wrong Item · Send the Right One keeps sent −1 and ordered +1', () => {
    // Before Approve: shorts M 5, tee M 5. The tee we sent is with the customer, the shorts stay.
    const after = approveThenReject('send-right-one');
    assert.deepEqual(after.tee, { m: 4, l: 5 });
    assert.deepEqual(after.shorts, { m: 6, l: 5 });
  });

  it('Reject after Approve of Wrong Item · Refund moves no stock', () => {
    const after = approveThenReject('refund');
    assert.deepEqual(after.tee, { m: 4, l: 5 });
    assert.deepEqual(after.shorts, { m: 6, l: 5 });
    const items = withSentPieces(
      item({ kind: 'wrong-item', wants: 'refund' }),
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
      products({ tee: sized(5, 5) }),
    );
    assert.deepEqual(approvePlan(items).reject, { take: [], putBack: [] });
  });

  it('Reject moves stock once only: a second Reject, or one before Approve, moves nothing', () => {
    const items = withSentPieces(
      item({ kind: 'wrong-item', wants: 'send-right-one' }),
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
      products({ tee: sized(5, 5) }),
    );
    const plan = approvePlan(items);
    const request = {
      stockTakenAt: 'set',
      approveStock: savedStep(plan.approve),
      rejectStock: savedStep(plan.reject),
    };
    assert.deepEqual(rejectStockFor(request), {
      take: [],
      putBack: [{ productId: 'shorts', selection: { size: 'm' }, quantity: 1 }],
    });
    assert.equal(rejectStockFor({ ...request, stockUndoneAt: 'set' }), null);
    assert.equal(rejectStockFor({}), null);
  });

  it('pieces whose product or size is gone count in notReturned', () => {
    const items = readStaffItems([
      { ...base, kind: 'return', reason: 'other', refund: true },
      {
        productId: 'gone',
        selection: { size: 'm' },
        name: 'Gone',
        quantity: 2,
        kind: 'return',
        refund: true,
      },
      {
        productId: 'shorts',
        selection: { size: 'xl' },
        name: 'Club Shorts',
        quantity: 1,
        kind: 'return',
        refund: true,
      },
    ]);
    const received = receiveStep(items, new Map());
    const moved = applyStockMoves(products({ shorts: sized(0, 0), gone: null }), received.step, {
      short: 'floor',
    });
    assert.equal(moved.notReturned, 3);
    assert.deepEqual(moved.next.get('shorts')?.stockBySize, { m: 1, l: 0 });
  });

  it('saves only the moves that happened, so Reject never undoes a skipped piece', () => {
    const live = products({ shorts: sized(1, 1), tee: sized(4, 4, 'Club Tee') });
    const items = withSentPieces(
      item({ kind: 'wrong-item', wants: 'refund', selection: { size: 'xl' } }),
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
      live,
    );
    const moved = applyStockMoves(live, approvePlan(items).approve, { short: 'refuse' });
    assert.equal(moved.notReturned, 1);
    assert.equal(moved.applied.putBack.length, 0);
    assert.equal(moved.applied.take.length, 1);
    const undo = rejectStep(undefined, savedStep(moved.applied));
    assert.deepEqual(undo.take, []);
  });

  it('a product with no stock set up says so instead of calling it removed', () => {
    const live = products({
      shorts: { stock: undefined, stockBySize: undefined, options: [], name: 'Club Shorts' },
    });
    const step = approvePlan(item({ kind: 'damaged', wants: 'send-another', selection: {} })).approve;
    assert.throws(
      () => applyStockMoves(live, step, { short: 'refuse' }),
      /Stock is not set up for Club Shorts/,
    );
  });

  it('saves the staff choices back on the items, keeping every other field', () => {
    const raw = [{ ...base, kind: 'wrong-item', wants: 'refund', askedLabel: 'Wrong Item · Refund' }];
    const live = products({ tee: sized(1, 1) });
    const items = withSentPieces(readStaffItems(raw), [{ itemIndex: 0, productId: 'tee', size: 'l' }], live);
    const merged = mergeItemChoices(raw, receiveStep(items, new Map()).items);
    assert.equal(merged[0]?.['askedLabel'], 'Wrong Item · Refund');
    assert.equal(merged[0]?.['sentProductId'], 'tee');
    assert.deepEqual(merged[0]?.['sentSelection'], { size: 'l' });
    assert.equal(merged[0]?.['canBeSoldAgain'], true);
    // A second Approve keeps the saved sent piece without asking again.
    assert.equal(withSentPieces(readStaffItems(merged), [], live)[0]?.sentProductId, 'tee');
  });

  it('reads and checks each call', () => {
    assert.deepEqual(parseReject({ requestId: 'abc123', reason: '  Worn  ' }), {
      requestId: 'abc123',
      reason: 'Worn',
    });
    assert.throws(() => parseReject({ requestId: 'abc123', reason: '' }), ReturnStepError);
    assert.throws(() => parseReject({ requestId: 'abc123', reason: 'x'.repeat(301) }), ReturnStepError);
    assert.throws(() => parseReject({ requestId: 'a/b', reason: 'x' }), ReturnStepError);
    assert.deepEqual(parseRefundSent({ requestId: 'abc', amountEgp: 950, reference: ' TX1 ' }), {
      requestId: 'abc',
      amountEgp: 950,
      reference: 'TX1',
    });
    assert.throws(() => parseRefundSent({ requestId: 'abc', amountEgp: 9.5 }), ReturnStepError);
    assert.throws(() => parseRefundSent({ requestId: 'abc', amountEgp: -1 }), ReturnStepError);
    // 0 passes the parse; the transaction accepts it only when the saved refund is 0.
    assert.equal(parseRefundSent({ requestId: 'abc', amountEgp: 0 }).amountEgp, 0);
    assert.equal(
      parseReceive({ requestId: 'abc', sellable: [{ itemIndex: 1, canBeSoldAgain: false }] }).sellable.get(1),
      false,
    );
    assert.throws(() => parseReceive({ requestId: 'abc', sellable: [{ itemIndex: 1 }] }), ReturnStepError);
    assert.deepEqual(parseApprove({ requestId: 'abc' }), { requestId: 'abc', sent: [] });
    assert.throws(
      () => parseApprove({ requestId: 'abc', sent: [{ itemIndex: 0, productId: 'a/b' }] }),
      ReturnStepError,
    );
  });
});

describe('a Wrong Item Sent request rejected after Approve keeps holding its pieces (ATS-299)', () => {
  const lines = readReturnOrderLines([
    { productId: 'shorts', selection: { size: 'm' }, quantity: 1, lineDisplay: 700, name: 'Club Shorts' },
    { productId: 'tee', selection: { size: 'l' }, quantity: 2, lineDisplay: 900, name: 'Training Tee' },
  ]);

  /** The saved request after Approve (or before it, when `approved` is false). */
  function savedRequest(rawItem: Record<string, unknown>, approved = true): Record<string, unknown> {
    const raw = [{ ...base, lineIndex: 0, ...rawItem }];
    if (!approved) return { items: raw };
    const sent =
      rawItem['kind'] === 'wrong-item'
        ? [{ itemIndex: 0, productId: 'tee', size: 'm' as string | null }]
        : [];
    const items = withSentPieces(
      readStaffItems(raw),
      sent,
      products({ tee: sized(5, 5), shorts: sized(5, 5) }),
    );
    const plan = approvePlan(items);
    return {
      items: raw,
      stockTakenAt: 'set',
      approveStock: savedStep(plan.approve),
      rejectStock: savedStep(plan.reject),
    };
  }

  /** Rejects the request and returns the order as staff and the shopper then read it. */
  function rejectOn(request: Record<string, unknown>, hasRefund: boolean) {
    const before = [
      {
        id: 'r1',
        status: request['stockTakenAt'] ? 'approved' : 'requested',
        hasRefund,
        items: [{ lineIndex: 0, quantity: 1, refund: hasRefund, autoGift: false }],
      },
    ];
    const keptItems = rejectKeptItems(request);
    const returns = JSON.parse(
      JSON.stringify(withReturnStatus(before, 'r1', 'rejected', { rejectReason: 'Not ours', keptItems })),
    );
    return { status: 'delivered', paymentMethod: 'instapay', returns };
  }

  for (const wants of ['send-right-one', 'refund'] as const) {
    it(`Wrong Item Sent · ${wants}: the line can't be asked for again and the order can't step back`, () => {
      const order = rejectOn(savedRequest({ kind: 'wrong-item', wants }), wants === 'refund');
      assert.deepEqual(order.returns[0].keptItems, [{ lineIndex: 0, quantity: 1 }]);
      const summaries = readReturnSummaries(order.returns);
      assert.deepEqual(summaries[0]!.keptItems, [{ lineIndex: 0, quantity: 1 }]);
      assert.deepEqual(piecesLeft(lines, summaries), [0, 2]);
      assert.equal(hasReturnHoldingPieces(order.returns), true);
      assert.deepEqual(allowedStatusMoves(order), []);
      assert.equal(canMoveStatus(order, 'shipped'), false);
      assert.equal(returnBlocksMove(order, 'shipped'), true);
    });
  }

  it('a Wrong Item Sent request rejected before Approve holds nothing', () => {
    const order = rejectOn(savedRequest({ kind: 'wrong-item', wants: 'refund' }, false), true);
    assert.equal('keptItems' in order.returns[0], false);
    assert.deepEqual(piecesLeft(lines, readReturnSummaries(order.returns)), [1, 2]);
    assert.equal(hasReturnHoldingPieces(order.returns), false);
    assert.deepEqual(allowedStatusMoves(order), ['shipped']);
  });

  it('a Different Size request rejected after Approve holds nothing', () => {
    const request = savedRequest({
      kind: 'different-size',
      newProductId: 'shorts',
      newSelection: { size: 'l' },
    });
    assert.ok(rejectStockFor(request), 'Approve took stock');
    const order = rejectOn(request, false);
    assert.equal('keptItems' in order.returns[0], false);
    assert.deepEqual(piecesLeft(lines, readReturnSummaries(order.returns)), [1, 2]);
    assert.equal(hasReturnHoldingPieces(order.returns), false);
    assert.deepEqual(allowedStatusMoves(order), ['shipped']);
  });

  it('a second Reject, or a request approved before rejectStock was saved, keeps nothing', () => {
    const request = savedRequest({ kind: 'wrong-item', wants: 'refund' });
    assert.deepEqual(rejectKeptItems({ ...request, stockUndoneAt: 'set' }), []);
    const { rejectStock: _legacy, ...older } = request;
    assert.deepEqual(rejectKeptItems(older), []);
  });
});
