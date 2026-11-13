import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  courierFeeEgp,
  giftsBack,
  isOpenReturn,
  nextReturnStatuses,
  piecesLeft,
  readReturnOrderLines,
  readReturnSummaries,
  refundEgpFor,
  returnEligibility,
  normalBoxFeeEgp,
  returnMoney,
  returnRef,
  returnStockPlan,
  undoStockStep,
  withReturnStatus,
  type ReturnSummary,
} from '../../lib/store/returns.js';
import {
  buildReturnRequest,
  parseRequestReturn,
  ReturnRequestError,
  returnSummaryEntry,
} from '../../lib/returns/return-request.js';
import { isOrderShopper } from '../../lib/returns/return-access.js';
import { orderViewFields } from '../../lib/orders/order-view.js';
import { returnEmailsForWrite, returnClaimId } from '../../lib/email/return-email-events.js';
import { readReturnForEmail } from '../../lib/email/return-email-model.js';
import { renderReturnEmail } from '../../lib/email/return-email-templates.js';
import { DEFAULT_SHIPPING_SETTINGS } from '../../lib/shipping/shipping-settings.js';

const DAY = 24 * 60 * 60 * 1000;
const DELIVERED = Date.UTC(2026, 10, 10, 12);
const NOW = DELIVERED + 3 * DAY;

const SHORTS = { productId: 'shorts-black', selection: { size: 'm' } };
const SHORTS_L = { productId: 'shorts-black', selection: { size: 'l' } };
const TEE = { productId: 'tee-white', selection: { size: 'l' } };

describe('returnStockPlan (every row of the table)', () => {
  it('Different Size / Different Colour: new piece −1 at Approve, returned piece +1 at Received', () => {
    for (const kind of ['different-size', 'different-colour'] as const) {
      const plan = returnStockPlan([{ kind, wants: null, quantity: 1, ordered: SHORTS, newPiece: SHORTS_L }]);
      assert.deepEqual(plan.approve, { take: [{ ...SHORTS_L, quantity: 1 }], putBack: [] });
      assert.deepEqual(plan.received, { take: [], putBack: [{ ...SHORTS, quantity: 1 }] });
      assert.deepEqual(plan.missing, []);
    }
  });

  it('Different Size: nothing back on the shelf when it can not be sold again', () => {
    const plan = returnStockPlan([
      {
        kind: 'different-size',
        wants: null,
        quantity: 2,
        ordered: SHORTS,
        newPiece: SHORTS_L,
        canBeSoldAgain: false,
      },
    ]);
    assert.deepEqual(plan.approve.take, [{ ...SHORTS_L, quantity: 2 }]);
    assert.deepEqual(plan.received.putBack, []);
  });

  it('Return It: nothing at Approve, piece +1 at Received (if it can be sold again)', () => {
    const plan = returnStockPlan([{ kind: 'return', wants: null, quantity: 1, ordered: TEE }]);
    assert.deepEqual(plan.approve, { take: [], putBack: [] });
    assert.deepEqual(plan.received.putBack, [{ ...TEE, quantity: 1 }]);
    const notSellable = returnStockPlan([
      { kind: 'return', wants: null, quantity: 1, ordered: TEE, canBeSoldAgain: false },
    ]);
    assert.deepEqual(notSellable.received.putBack, []);
  });

  it('Damaged · Send Another: same piece −1 at Approve, nothing back by default', () => {
    const plan = returnStockPlan([{ kind: 'damaged', wants: 'send-another', quantity: 1, ordered: TEE }]);
    assert.deepEqual(plan.approve, { take: [{ ...TEE, quantity: 1 }], putBack: [] });
    assert.deepEqual(plan.received.putBack, []);
    const sellable = returnStockPlan([
      { kind: 'damaged', wants: 'send-another', quantity: 1, ordered: TEE, canBeSoldAgain: true },
    ]);
    assert.deepEqual(sellable.received.putBack, [{ ...TEE, quantity: 1 }]);
  });

  it('Damaged · Refund: nothing at Approve, nothing at Received by default', () => {
    const plan = returnStockPlan([{ kind: 'damaged', wants: 'refund', quantity: 1, ordered: TEE }]);
    assert.deepEqual(plan.approve, { take: [], putBack: [] });
    assert.deepEqual(plan.received.putBack, []);
  });

  it('Wrong Item Sent · Send the Right One: sent piece −1 at Approve, sent piece +1 at Received', () => {
    const plan = returnStockPlan([
      { kind: 'wrong-item', wants: 'send-right-one', quantity: 1, ordered: SHORTS, sentPiece: SHORTS_L },
    ]);
    assert.deepEqual(plan.approve, { take: [{ ...SHORTS_L, quantity: 1 }], putBack: [] });
    assert.deepEqual(plan.received.putBack, [{ ...SHORTS_L, quantity: 1 }]);
  });

  it('Wrong Item Sent · Refund: sent piece −1 and ordered piece +1 at Approve, sent piece +1 at Received', () => {
    const plan = returnStockPlan([
      { kind: 'wrong-item', wants: 'refund', quantity: 1, ordered: SHORTS, sentPiece: SHORTS_L },
    ]);
    assert.deepEqual(plan.approve, {
      take: [{ ...SHORTS_L, quantity: 1 }],
      putBack: [{ ...SHORTS, quantity: 1 }],
    });
    assert.deepEqual(plan.received.putBack, [{ ...SHORTS_L, quantity: 1 }]);
  });

  it('lists wrong items with no sent piece and exchanges with no new piece as missing', () => {
    const plan = returnStockPlan([
      { kind: 'wrong-item', wants: 'refund', quantity: 1, ordered: SHORTS },
      { kind: 'different-size', wants: null, quantity: 1, ordered: SHORTS },
    ]);
    assert.deepEqual(plan.missing, [0, 1]);
    assert.deepEqual(plan.approve, { take: [], putBack: [] });
  });

  it('undoing Approve swaps take and put back', () => {
    const plan = returnStockPlan([
      { kind: 'wrong-item', wants: 'refund', quantity: 1, ordered: SHORTS, sentPiece: SHORTS_L },
    ]);
    assert.deepEqual(undoStockStep(plan.approve), {
      take: [{ ...SHORTS, quantity: 1 }],
      putBack: [{ ...SHORTS_L, quantity: 1 }],
    });
  });
});

describe('returnEligibility', () => {
  const base = { status: 'delivered', deliveredAtMs: DELIVERED, isInternational: false, returns: [] };

  it('allows a Delivered Egypt order within 14 days', () => {
    const result = returnEligibility(base, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.closesAtMs, DELIVERED + 14 * DAY);
    assert.equal(returnEligibility(base, DELIVERED + 14 * DAY).ok, true);
  });

  it('refuses with a plain message', () => {
    const cases: [object, number, string][] = [
      [{ status: 'shipped' }, NOW, 'not-delivered'],
      [{ isInternational: true }, NOW, 'abroad'],
      [{ deliveredAtMs: null }, NOW, 'no-delivery-date'],
      [{}, DELIVERED + 14 * DAY + 1, 'window-closed'],
      [{ returns: [summary('requested', false)] }, NOW, 'open-request'],
      [{ returns: [summary('approved', false)] }, NOW, 'open-request'],
      [{ returns: [summary('received', true)] }, NOW, 'open-request'],
    ];
    for (const [patch, now, reason] of cases) {
      const result = returnEligibility({ ...base, ...patch }, now);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, reason);
      assert.ok(!result.ok && result.message.length > 10);
    }
  });

  it('lets a new request in after an exchange is Received, or a request is Rejected or Cancelled', () => {
    for (const entry of [
      summary('received', false),
      summary('rejected', true),
      summary('cancelled', false),
    ]) {
      assert.equal(returnEligibility({ ...base, returns: [entry] }, NOW).ok, true);
    }
  });

  it('stops after 10 requests on one order', () => {
    const returns = Array.from({ length: 10 }, () => summary('cancelled', false));
    const result = returnEligibility({ ...base, returns }, NOW);
    assert.equal(!result.ok && result.reason, 'too-many-requests');
  });
});

describe('statuses', () => {
  it('follows Requested → Approved → Received → Refund Sent', () => {
    assert.deepEqual(nextReturnStatuses('requested', true), ['approved', 'rejected']);
    assert.deepEqual(nextReturnStatuses('approved', true), ['received', 'rejected']);
    assert.deepEqual(nextReturnStatuses('received', true), ['refund-sent']);
    assert.deepEqual(nextReturnStatuses('received', false), []);
    assert.deepEqual(nextReturnStatuses('requested', false, true), ['cancelled']);
    assert.deepEqual(nextReturnStatuses('approved', false, true), []);
    assert.equal(isOpenReturn('refund-sent', true), false);
  });

  it('changes one request in the order summary and keeps the rest', () => {
    const raw = [
      { id: 'r1', status: 'requested', items: [] },
      { id: 'r2', status: 'cancelled', items: [] },
    ];
    assert.deepEqual(withReturnStatus(raw, 'r1', 'cancelled'), [
      { id: 'r1', status: 'cancelled', items: [] },
      { id: 'r2', status: 'cancelled', items: [] },
    ]);
    assert.deepEqual(withReturnStatus(null, 'r1', 'cancelled'), []);
  });

  it('saves the amount staff really sent with Refund Sent', () => {
    const raw = [{ id: 'r1', status: 'received', items: [], refundEgp: 580 }];
    assert.deepEqual(withReturnStatus(raw, 'r1', 'refund-sent', { refundSentEgp: 700 }), [
      { id: 'r1', status: 'refund-sent', items: [], refundEgp: 580, refundSentEgp: 700 },
    ]);
    // Only Refund Sent changes the amount.
    assert.deepEqual(withReturnStatus(raw, 'r1', 'rejected', { refundSentEgp: 700 }), [
      { id: 'r1', status: 'rejected', items: [], refundEgp: 580 },
    ]);
  });

  it('saves the reject reason the shopper sees on the summary entry', () => {
    const raw = [
      { id: 'r1', status: 'approved', items: [], refundEgp: 580 },
      { id: 'r2', status: 'requested', items: [] },
    ];
    assert.deepEqual(withReturnStatus(raw, 'r1', 'rejected', { rejectReason: '  Worn after delivery. ' }), [
      { id: 'r1', status: 'rejected', items: [], refundEgp: 580, rejectReason: 'Worn after delivery.' },
      { id: 'r2', status: 'requested', items: [] },
    ]);
    // A reason only goes with Rejected, and an empty one is never written.
    assert.deepEqual(withReturnStatus(raw, 'r2', 'approved', { rejectReason: 'No' })[1], {
      id: 'r2',
      status: 'approved',
      items: [],
    });
    assert.deepEqual(withReturnStatus(raw, 'r2', 'rejected', { rejectReason: '  ' })[1], {
      id: 'r2',
      status: 'rejected',
      items: [],
    });
  });

  it('makes a short ref like the order ref', () => {
    assert.equal(returnRef('k7q2m9xyz'), '#R-K7Q2M9');
  });
});

describe('pieces, gifts and money', () => {
  const lines = readReturnOrderLines([
    {
      productId: 'shorts-black',
      selection: { size: 'm' },
      quantity: 2,
      lineDisplay: 1300,
      name: 'Padel Shorts',
    },
    {
      productId: 'socks',
      selection: {},
      quantity: 2,
      lineDisplay: 0,
      gift: { forLine: 0, giftName: 'Free socks' },
    },
    { productId: 'tee-white', selection: { size: 'l' }, quantity: 3, unitEgp: 400, discountEgp: 100 },
  ]);

  it('reads lines, the paid amount and gifts', () => {
    assert.equal(lines[0]!.paidEgp, 1300);
    assert.equal(lines[1]!.giftForLine, 0);
    assert.equal(lines[1]!.paidEgp, 0);
    assert.equal(lines[2]!.paidEgp, 1100);
  });

  it('counts pieces left, skipping Rejected and Cancelled requests', () => {
    const returns = [
      { ...summary('approved', true), items: [{ lineIndex: 0, quantity: 1, refund: true, autoGift: false }] },
      {
        ...summary('cancelled', true),
        items: [{ lineIndex: 2, quantity: 3, refund: true, autoGift: false }],
      },
    ];
    assert.deepEqual(piecesLeft(lines, returns), [1, 2, 3]);
  });

  it('refund per piece is lineDisplay ÷ quantity, the whole line exactly', () => {
    assert.equal(refundEgpFor(lines[0]!, 1), 650);
    assert.equal(refundEgpFor(lines[0]!, 2), 1300);
    assert.equal(refundEgpFor(lines[2]!, 1), 367);
    assert.equal(refundEgpFor(lines[2]!, 3), 1100);
    assert.equal(refundEgpFor(lines[1]!, 1), 0);
    // Rounded on the running total: refunds of one line never add up to more than was paid.
    const odd = readReturnOrderLines([{ productId: 'p', quantity: 2, lineDisplay: 1301 }])[0]!;
    assert.equal(refundEgpFor(odd, 1) + refundEgpFor(odd, 1, 1), 1301);
  });

  it('gifts come back with a refund: floor share, all of them with the last pieces', () => {
    const left = [2, 2, 3];
    assert.deepEqual(giftsBack(lines, [{ lineIndex: 0, quantity: 1 }], left, [1, 0, 0]), [
      { lineIndex: 1, forLine: 0, quantity: 1 },
    ]);
    assert.deepEqual(giftsBack(lines, [{ lineIndex: 0, quantity: 2 }], left, [2, 0, 0]), [
      { lineIndex: 1, forLine: 0, quantity: 2 },
    ]);
    // The gift line was already exchanged by the shopper in this request: only what is left comes back.
    assert.deepEqual(giftsBack(lines, [{ lineIndex: 0, quantity: 2 }], left, [2, 1, 0]), [
      { lineIndex: 1, forLine: 0, quantity: 1 },
    ]);
    assert.deepEqual(giftsBack(lines, [], left, [1, 0, 0]), []);
    // Exchanging one piece and returning the other sends back only the returned piece's share.
    assert.deepEqual(giftsBack(lines, [{ lineIndex: 0, quantity: 1 }], left, [2, 0, 0]), [
      { lineIndex: 1, forLine: 0, quantity: 1 },
    ]);
    // One piece was exchanged in an earlier request; refunding the last piece still sends back one gift.
    const exchanged = [
      {
        ...summary('received', false),
        items: [{ lineIndex: 0, quantity: 1, refund: false, autoGift: false }],
      },
    ];
    assert.deepEqual(giftsBack(lines, [{ lineIndex: 0, quantity: 1 }], [1, 2, 3], [1, 0, 0], exchanged), [
      { lineIndex: 1, forLine: 0, quantity: 1 },
    ]);
    // One piece was refunded earlier with its gift; refunding the last piece sends back the other gift.
    const refundedOne = [
      {
        ...summary('refund-sent', true),
        items: [
          { lineIndex: 0, quantity: 1, refund: true, autoGift: false },
          { lineIndex: 1, quantity: 1, refund: false, autoGift: true },
        ],
      },
    ];
    assert.deepEqual(giftsBack(lines, [{ lineIndex: 0, quantity: 1 }], [1, 1, 3], [1, 0, 0], refundedOne), [
      { lineIndex: 1, forLine: 0, quantity: 1 },
    ]);
  });

  it('courier fee: the order fee, the box price when it was free, 0 when the store is at fault', () => {
    assert.equal(courierFeeEgp({ orderFeeEgp: 70, normalBoxFeeEgp: 115, storeFault: false }), 70);
    assert.equal(courierFeeEgp({ orderFeeEgp: 0, normalBoxFeeEgp: 115, storeFault: false }), 115);
    assert.equal(courierFeeEgp({ orderFeeEgp: 70, normalBoxFeeEgp: 115, storeFault: true }), 0);
  });

  it('fee comes off the refund, or is cash at the door for an exchange only', () => {
    assert.deepEqual(returnMoney(650, 70, true), {
      itemsEgp: 650,
      feeEgp: 70,
      feePaid: 'off-refund',
      refundEgp: 580,
      cashAtDoorEgp: 0,
    });
    assert.deepEqual(returnMoney(0, 70, false), {
      itemsEgp: 0,
      feeEgp: 70,
      feePaid: 'cash',
      refundEgp: 0,
      cashAtDoorEgp: 70,
    });
    assert.equal(returnMoney(50, 70, true).cashAtDoorEgp, 20);
    assert.equal(returnMoney(650, 0, true).feePaid, 'free');
  });

  it('the normal box price comes from settings, else the biggest Egypt box', () => {
    assert.equal(normalBoxFeeEgp(DEFAULT_SHIPPING_SETTINGS, 'box1'), 115);
    assert.equal(normalBoxFeeEgp(DEFAULT_SHIPPING_SETTINGS, null), 135);
    assert.equal(normalBoxFeeEgp(DEFAULT_SHIPPING_SETTINGS, 'gone'), 135);
    assert.equal(normalBoxFeeEgp(null, 'box1'), 0);
  });
});

describe('requestReturn input and building', () => {
  const order = {
    status: 'delivered',
    deliveredAt: DELIVERED,
    customerId: 'uid-1',
    customerEmail: 'mariam@example.com',
    viewKey: 'k'.repeat(43),
    shipping: {
      fullName: 'Mariam Hassan',
      phone: '01012345678',
      country: 'EG',
      line1: '12 Abbas El Akkad',
      city: 'Nasr City',
    },
    pricing: {
      isInternational: false,
      shipping: { kind: 'domestic-box', boxId: 'box1', priceEgp: 70 },
      lines: [
        {
          productId: 'shorts-black',
          selection: { size: 'm' },
          quantity: 1,
          lineDisplay: 700,
          name: 'Padel Shorts',
          optionLabels: [{ label: 'Size', value: 'M' }],
        },
        {
          productId: 'tee-white',
          selection: { size: 'l' },
          quantity: 1,
          lineDisplay: 650,
          name: 'Training Tee',
        },
        {
          productId: 'socks',
          selection: {},
          quantity: 1,
          lineDisplay: 0,
          name: 'Sport Socks',
          gift: { forLine: 1 },
        },
      ],
    },
  };
  const sizes = [
    {
      key: 'size',
      label: 'Size',
      values: [
        { id: 'm', label: 'M' },
        { id: 'l', label: 'L' },
      ],
    },
  ];
  const products = new Map<string, Record<string, unknown> | undefined>([
    ['shorts-black', { options: sizes, modelGroup: 'padel-shorts', price: 700, colors: ['black'] }],
    [
      'shorts-white',
      { options: sizes, modelGroup: 'padel-shorts', price: 700, colors: ['white'], published: true },
    ],
    ['shorts-red', { options: sizes, modelGroup: 'padel-shorts', price: 750, colors: ['red'] }],
  ]);
  const build = (raw: object, patch: Record<string, unknown> = {}) =>
    buildReturnRequest({
      requestId: 'k7q2m9abc',
      orderId: 'a1b2c3xyz',
      order: { ...order, ...patch },
      input: parseRequestReturn({ orderId: 'a1b2c3xyz', ...raw }),
      products,
      normalBoxFeeEgp: 115,
      nowMs: NOW,
    });

  it('builds the design example: size exchange plus a return with its gift', () => {
    const built = build({
      items: [
        { lineIndex: 0, quantity: 1, kind: 'different-size', size: 'l' },
        { lineIndex: 1, quantity: 1, kind: 'return', reason: 'didnt-fit' },
      ],
      note: '  The shorts run small. ',
      refundTo: '01012345678',
    });
    assert.equal(built.ref, '#R-K7Q2M9');
    assert.equal(built.orderRef, '#A1B2C3');
    assert.deepEqual(
      built.items.map((item) => item.askedLabel),
      ['Size M → L', "Return · Didn't fit", 'Free gift · comes back with Training Tee'],
    );
    assert.deepEqual(built.items[0]!.newSelection, { size: 'l' });
    assert.equal(built.items[2]!.autoGift, true);
    assert.equal(built.note, 'The shorts run small.');
    assert.equal(built.itemsEgp, 650);
    assert.equal(built.feeEgp, 70);
    assert.equal(built.refundEgp, 580);
    assert.equal(built.feePaid, 'off-refund');
    assert.deepEqual(built.summaryItems, [
      { lineIndex: 0, quantity: 1, refund: false, autoGift: false, askedLabel: 'Size M → L' },
      { lineIndex: 1, quantity: 1, refund: true, autoGift: false, askedLabel: "Return · Didn't fit" },
      {
        lineIndex: 2,
        quantity: 1,
        refund: false,
        autoGift: true,
        askedLabel: 'Free gift · comes back with Training Tee',
      },
    ]);
    const entry = returnSummaryEntry('k7q2m9abc', built);
    assert.deepEqual(entry, {
      id: 'k7q2m9abc',
      ref: '#R-K7Q2M9',
      status: 'requested',
      hasRefund: true,
      items: built.summaryItems,
      storeFault: false,
      refundEgp: 580,
    });
    // Shoppers and guests read the summary: no InstaPay details, note or customer.
    for (const key of ['refundTo', 'note', 'customer', 'customerEmail']) assert.equal(key in entry, false);
    assert.equal(built.customer.guest, false);
  });

  it('a different colour must be the same model and the same price', () => {
    const ok = build({
      items: [
        { lineIndex: 0, quantity: 1, kind: 'different-colour', colourProductId: 'shorts-white', size: 'l' },
      ],
    });
    assert.equal(ok.items[0]!.askedLabel, 'Black → White · Size L');
    assert.equal(ok.feePaid, 'cash');
    assert.equal(ok.cashAtDoorEgp, 70);
    assert.throws(
      () =>
        build({
          items: [
            { lineIndex: 0, quantity: 1, kind: 'different-colour', colourProductId: 'shorts-red', size: 'l' },
          ],
        }),
      /Different price/,
    );
  });

  it('damaged items make the courier free and need a refund address only for refunds', () => {
    const built = build({ items: [{ lineIndex: 1, quantity: 1, kind: 'damaged', wants: 'send-another' }] });
    assert.equal(built.storeFault, true);
    assert.equal(built.feeEgp, 0);
    assert.equal(built.hasRefund, false);
    const entry = returnSummaryEntry('k7q2m9abc', built);
    assert.equal(entry.storeFault, true);
    assert.equal(entry.refundEgp, 0);
    assert.equal(entry.items[0]!.askedLabel, 'Damaged · Send Another');
    assert.throws(
      () =>
        parseRequestReturn({
          orderId: 'a1',
          items: [{ lineIndex: 1, quantity: 1, kind: 'damaged', wants: 'refund' }],
        }),
      /InstaPay/,
    );
  });

  it('refuses with plain messages', () => {
    const refusals: [object, Record<string, unknown>, RegExp][] = [
      [{ items: [] }, {}, /Choose the items/],
      [{ items: [{ lineIndex: 0, quantity: 2, kind: 'damaged', wants: 'send-another' }] }, {}, /more pieces/],
      [
        { items: [{ lineIndex: 2, quantity: 1, kind: 'return', reason: 'other' }], refundTo: 'x' },
        {},
        /free gift/,
      ],
      [{ items: [{ lineIndex: 0, quantity: 1, kind: 'different-size', size: 'm' }] }, {}, /different size/],
      [
        { items: [{ lineIndex: 0, quantity: 1, kind: 'damaged', wants: 'send-another' }] },
        { status: 'shipped' },
        /once your order is delivered/,
      ],
      [
        { items: [{ lineIndex: 0, quantity: 1, kind: 'damaged', wants: 'send-another' }] },
        { deliveredAt: null },
        /WhatsApp/,
      ],
      [
        { items: [{ lineIndex: 0, quantity: 1, kind: 'damaged', wants: 'send-another' }] },
        { returns: [{ id: 'r1', status: 'requested', items: [{ lineIndex: 1, quantity: 1 }] }] },
        /in progress/,
      ],
      [{ items: [{ lineIndex: 0, quantity: 1, kind: 'return' }], refundTo: 'x' }, {}, /why/],
      [
        { items: [{ lineIndex: 1, quantity: 1, kind: 'different-size', size: 'm' }] },
        {},
        /no longer available/,
      ],
      [
        {
          items: [{ lineIndex: 0, quantity: 1, kind: 'damaged', wants: 'send-another' }],
          note: 'x'.repeat(501),
        },
        {},
        /500/,
      ],
    ];
    for (const [raw, patch, message] of refusals) {
      assert.throws(
        () => build(raw, patch),
        (error: unknown) => error instanceof ReturnRequestError && message.test(error.message),
      );
    }
  });

  it('finds the shopper by uid or by the order view key', () => {
    assert.equal(isOrderShopper(order, { auth: { uid: 'uid-1' } as never }, null), true);
    assert.equal(isOrderShopper(order, { auth: { uid: 'uid-2' } as never }, null), false);
    assert.equal(isOrderShopper({ ...order, customerId: null }, { auth: undefined }, 'k'.repeat(43)), true);
    assert.equal(isOrderShopper({ ...order, customerId: null }, { auth: undefined }, 'j'.repeat(43)), false);
    assert.equal(
      isOrderShopper({ ...order, customerId: null, viewKey: null }, { auth: undefined }, null),
      false,
    );
  });

  it('copies the returns summary into the guest order view', () => {
    const view = orderViewFields('a1', { returns: [{ id: 'r1', status: 'requested' }] });
    assert.deepEqual(view['returns'], [{ id: 'r1', status: 'requested' }]);
    assert.deepEqual(orderViewFields('a1', {})['returns'], []);
    const full = [
      {
        id: 'r1',
        status: 'rejected',
        storeFault: true,
        refundEgp: 580,
        rejectReason: 'Worn after delivery.',
        items: [{ lineIndex: 0, quantity: 1, refund: true, autoGift: false, askedLabel: 'Damaged · Refund' }],
      },
    ];
    assert.deepEqual(orderViewFields('a1', { returns: full })['returns'], full);
  });

  it('reads the order returns field', () => {
    const read = readReturnSummaries([
      { id: 'abcdefg', status: 'approved', hasRefund: true, items: [{ lineIndex: 0, quantity: 1 }] },
      { id: 'x' },
    ]);
    assert.equal(read.length, 1);
    assert.equal(read[0]!.ref, '#R-ABCDEF');
  });
});

describe('return emails', () => {
  const ctx = {
    storefrontUrl: 'https://atteyastore.com',
    imageBaseUrl: 'https://ik.imagekit.io/atteyastore',
    canReply: true,
    storeName: 'Atteya Store',
    whatsappNumber: '+20 100 000 0000',
    instapay: { address: '', number: '' },
    bankTransfer: { accountName: '', bankName: '', iban: '', swift: '' },
  } as never;
  const data = {
    ref: '#R-K7Q2M9',
    orderId: 'a1b2c3xyz',
    orderRef: '#A1B2C3',
    status: 'requested',
    customer: {
      name: 'Mariam Hassan',
      phone: '01012345678',
      email: 'mariam@example.com',
      guest: true,
      country: 'EG',
      line1: '12 Abbas El Akkad',
      city: 'Nasr City',
    },
    items: [
      {
        lineIndex: 0,
        quantity: 1,
        kind: 'different-size',
        refund: false,
        name: 'Padel Shorts',
        askedLabel: 'Size M → L',
      },
      {
        lineIndex: 1,
        quantity: 1,
        kind: 'return',
        refund: true,
        name: 'Training Tee',
        askedLabel: "Return · Didn't fit",
        refundEgp: 650,
      },
      {
        lineIndex: 2,
        quantity: 1,
        kind: 'return',
        refund: false,
        autoGift: true,
        forLine: 1,
        name: 'Sport Socks',
        askedLabel: 'Free gift',
      },
    ],
    note: 'The shorts run small.',
    refundTo: '01012345678',
    hasRefund: true,
    storeFault: false,
    itemsEgp: 650,
    feeEgp: 70,
    feePaid: 'off-refund',
    refundEgp: 580,
    cashAtDoorEgp: 0,
    createdAt: Date.UTC(2026, 10, 13, 12, 32),
    orderDeliveredAt: DELIVERED,
  };

  it('a new request sends the staff alert and Request Sent once', () => {
    const request = readReturnForEmail('k7q2m9abc', data, 'v'.repeat(43))!;
    assert.deepEqual(returnEmailsForWrite(null, request), ['store-return-request', 'return-requested']);
    assert.deepEqual(returnEmailsForWrite(request, { ...request, status: 'cancelled' }), []);
    assert.equal(returnClaimId('return-requested', request), 'k7q2m9abc_return-requested');
  });

  it('the shopper email says Request Sent with the refund, the items and a guest order link', () => {
    const request = readReturnForEmail('k7q2m9abc', data, 'v'.repeat(43))!;
    const email = renderReturnEmail('return-requested', request, ctx);
    assert.match(email.subject, /#R-K7Q2M9/);
    assert.match(email.html, /REQUEST<br>SENT/);
    assert.match(email.html, /RETURN OR EXCHANGE · #R-K7Q2M9/);
    assert.match(email.html, /Size M → L/);
    assert.match(email.html, /Please hand it back with the Training Tee\./);
    assert.match(email.html, /EGP\s?580/);
    assert.match(email.html, /View Your Order/);
    assert.match(email.html, /\?key=v{43}/);
    assert.doesNotMatch(email.html, /Send Photos on WhatsApp/);
    assert.match(email.text, /Your refund: EGP\s?580/);
  });

  it('a free exchange-only visit says Free, never cash at the door', () => {
    const exchangeOnly = {
      ...data,
      items: [data.items[0]],
      hasRefund: false,
      storeFault: true,
      itemsEgp: 0,
      feeEgp: 0,
      feePaid: 'free',
      refundEgp: 0,
    };
    const request = readReturnForEmail('k7q2m9abc', exchangeOnly, null)!;
    for (const kind of ['return-requested', 'store-return-request'] as const) {
      const email = renderReturnEmail(kind, request, ctx);
      assert.doesNotMatch(email.text, /cash at (your|the) door: Free/);
      assert.match(email.text, /Courier fee: Free/);
    }
  });

  it('a returned gift shows once even when its line is split over two refund items', () => {
    const split = {
      ...data,
      items: [
        { ...data.items[1], quantity: 1 },
        { ...data.items[1], quantity: 1, askedLabel: 'Return · Other' },
        data.items[2],
      ],
    };
    const email = renderReturnEmail('return-requested', readReturnForEmail('k7q2m9abc', split, null)!, ctx);
    assert.equal(email.html.split('Please hand it back with the Training Tee.').length - 1, 1);
  });

  it('damaged or wrong items get Send Photos on WhatsApp with the request ref', () => {
    const request = readReturnForEmail(
      'k7q2m9abc',
      { ...data, storeFault: true, feeEgp: 0, feePaid: 'free' },
      null,
    )!;
    const email = renderReturnEmail('return-requested', request, ctx);
    assert.match(email.html, /Send Photos on WhatsApp/);
    assert.match(email.html, /wa\.me\/201000000000\?text=[^"]*R-K7Q2M9/);
    assert.match(email.html, /Delivery is on us\./);
  });

  it('the staff alert shows the refs, customer, items, note, money and Open Request', () => {
    const request = readReturnForEmail('k7q2m9abc', data, null)!;
    const email = renderReturnEmail('store-return-request', request, ctx);
    assert.match(email.subject, /^Return Request #R-K7Q2M9 – Order #A1B2C3 – Refund EGP\s580$/);
    assert.match(email.html, /RETURN REQUEST · 13 NOV · 14:32/);
    assert.match(email.html, /For order #A1B2C3 · delivered 10 Nov/);
    assert.match(email.html, /Mariam Hassan/);
    assert.match(email.html, /Guest checkout/);
    assert.match(email.html, /Message Customer on WhatsApp/);
    assert.match(email.html, /×1/);
    assert.match(email.html, /comes back with the Training Tee/);
    assert.match(email.html, /&quot;The shorts run small\.&quot;/);
    assert.match(email.html, /Refund by InstaPay/);
    assert.match(email.html, /off the refund/);
    assert.match(email.html, /\/admin\/returns\/k7q2m9abc/);
    assert.match(email.text, /To 01012345678, after the items are received\./);
  });
});

function summary(status: ReturnSummary['status'], hasRefund: boolean): ReturnSummary {
  return {
    id: `r-${Math.random().toString(36).slice(2, 8)}`,
    ref: '#R-X',
    status,
    hasRefund,
    items: [],
    createdAtMs: null,
  };
}
