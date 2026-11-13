import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyStockMoves,
  approveStep,
  mergeItemChoices,
  parseApprove,
  parseRefundSent,
  parseReject,
  parseReceive,
  readSavedStep,
  readStaffItems,
  receiveStep,
  rejectUndoStep,
  ReturnStepError,
  savedStep,
  withSentPieces,
  type StepProduct,
} from '../../lib/returns/return-staff-step.js';

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
  const approve = approveStep(items);
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
    const step = approveStep(
      item({ kind: 'different-size', newProductId: 'shorts', newSelection: { size: 'l' } }),
    );
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
    const live = products({ shorts: sized(1, 1), tee: sized(4, 4, 'Club Tee') });
    const items = withSentPieces(
      item({ kind: 'wrong-item', wants: 'refund' }),
      [{ itemIndex: 0, productId: 'tee', size: 'm' }],
      live,
    );
    const approve = approveStep(items);
    // Saved on the request and read back on Reject.
    const undo = rejectUndoStep(readSavedStep(JSON.parse(JSON.stringify(savedStep(approve)))));
    const after = applyStockMoves(products({ shorts: sized(2, 1), tee: sized(3, 4, 'Club Tee') }), undo, {
      short: 'floor',
    });
    assert.deepEqual(after.next.get('tee')?.stockBySize, { m: 4, l: 4 });
    assert.deepEqual(after.next.get('shorts')?.stockBySize, { m: 1, l: 1 });
    // The ordered piece sold meanwhile: the undo stops at 0 instead of blocking the reject.
    const sold = applyStockMoves(products({ shorts: sized(0, 1), tee: sized(3, 4) }), undo, {
      short: 'floor',
    });
    assert.deepEqual(sold.next.get('shorts')?.stockBySize, { m: 0, l: 1 });
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
    const moved = applyStockMoves(live, approveStep(items), { short: 'refuse' });
    assert.equal(moved.notReturned, 1);
    assert.equal(moved.applied.putBack.length, 0);
    assert.equal(moved.applied.take.length, 1);
    const undo = rejectUndoStep(moved.applied);
    assert.deepEqual(undo.take, []);
  });

  it('a product with no stock set up says so instead of calling it removed', () => {
    const live = products({
      shorts: { stock: undefined, stockBySize: undefined, options: [], name: 'Club Shorts' },
    });
    const step = approveStep(item({ kind: 'damaged', wants: 'send-another', selection: {} }));
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
