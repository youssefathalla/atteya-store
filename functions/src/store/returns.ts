/**
 * Returns & Exchanges rules shared by Cloud Functions and the website (ATS-291): the request kinds
 * and statuses with their names, the 14-day window, who may send a request (`returnEligibility`),
 * how many pieces are left, the free gift rule, the refund and courier fee math, and the stock
 * plan per kind (`returnStockPlan`). Pure: no Firestore, so every rule is unit tested
 * (`returns/returns.test.ts`). Edit ONLY this file (functions/src/store/returns.ts), then run
 * `npm run sync:engine`, which copies it to src/app/core/config/returns.ts.
 *
 * Returns are recorded next to the order (`returnRequests/{id}` and the order's `returns`
 * summary), never by changing `pricing.lines` or any order total.
 */

// ── Kinds, reasons and statuses ─────────────────────────────────────────────

/** What the shopper asks for, chosen per item. */
export type ReturnKind = 'different-size' | 'different-colour' | 'return' | 'damaged' | 'wrong-item';

export const RETURN_KINDS: readonly ReturnKind[] = [
  'different-size',
  'different-colour',
  'return',
  'damaged',
  'wrong-item',
];

/** Why a Return It item comes back. */
export type ReturnReason = 'didnt-fit' | 'not-as-pictured' | 'changed-mind' | 'other';

export const RETURN_REASONS: readonly ReturnReason[] = [
  'didnt-fit',
  'not-as-pictured',
  'changed-mind',
  'other',
];

/**
 * What the shopper wants for a Damaged Item (`send-another` or `refund`) or a Wrong Item Sent
 * (`send-right-one` or `refund`).
 */
export type ReturnWants = 'send-another' | 'send-right-one' | 'refund';

/**
 * Requested → Approved → Received; a request with any refund item goes on to Refund Sent.
 * Rejected is possible any time before Received, Cancelled (by the shopper) only while Requested.
 */
export type ReturnStatus = 'requested' | 'approved' | 'received' | 'refund-sent' | 'rejected' | 'cancelled';

export const RETURN_STATUSES: readonly ReturnStatus[] = [
  'requested',
  'approved',
  'received',
  'refund-sent',
  'rejected',
  'cancelled',
];

/** Days after `deliveredAt` a request can still be sent. */
export const RETURN_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest note a shopper can add to a request. */
export const RETURN_NOTE_MAX = 500;

/** Longest InstaPay number or address (`refundTo`). */
export const RETURN_REFUND_TO_MAX = 100;

/** Longest reason the shopper sees when staff reject a request. */
export const REJECT_REASON_MAX = 300;

/** Longest InstaPay reference staff save with Refund Sent. */
export const REFUND_REFERENCE_MAX = 100;

/** Requests one order can ever have (cancelled and rejected ones included), so a loop can't flood staff. */
export const RETURN_REQUESTS_PER_ORDER_MAX = 10;

export function isReturnKind(value: unknown): value is ReturnKind {
  return typeof value === 'string' && (RETURN_KINDS as readonly string[]).includes(value);
}

export function isReturnReason(value: unknown): value is ReturnReason {
  return typeof value === 'string' && (RETURN_REASONS as readonly string[]).includes(value);
}

export function isReturnStatus(value: unknown): value is ReturnStatus {
  return typeof value === 'string' && (RETURN_STATUSES as readonly string[]).includes(value);
}

/** The wants a kind takes: none for exchanges and Return It. */
export function wantsFor(kind: ReturnKind): readonly ReturnWants[] {
  if (kind === 'damaged') return ['send-another', 'refund'];
  if (kind === 'wrong-item') return ['send-right-one', 'refund'];
  return [];
}

/** Kind names, written as names (copywriting skill). */
export function returnKindLabel(kind: ReturnKind): string {
  switch (kind) {
    case 'different-size':
      return 'Different Size';
    case 'different-colour':
      return 'Different Colour';
    case 'return':
      return 'Return It';
    case 'damaged':
      return 'Damaged Item';
    case 'wrong-item':
      return 'Wrong Item Sent';
  }
}

export function returnReasonLabel(reason: ReturnReason): string {
  switch (reason) {
    case 'didnt-fit':
      return "Didn't fit";
    case 'not-as-pictured':
      return 'Not as pictured';
    case 'changed-mind':
      return 'Changed my mind';
    case 'other':
      return 'Other';
  }
}

export function returnWantsLabel(wants: ReturnWants): string {
  switch (wants) {
    case 'send-another':
      return 'Send Another';
    case 'send-right-one':
      return 'Send the Right One';
    case 'refund':
      return 'Refund';
  }
}

/** Status names: the shopper sees the same words as staff. */
export function returnStatusLabel(status: ReturnStatus): string {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'approved':
      return 'Approved';
    case 'received':
      return 'Received';
    case 'refund-sent':
      return 'Refund Sent';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
  }
}

/** True when the item is paid back in money: Return It, Damaged · Refund, Wrong Item Sent · Refund. */
export function isRefundItem(kind: ReturnKind, wants: ReturnWants | null): boolean {
  if (kind === 'return') return true;
  return (kind === 'damaged' || kind === 'wrong-item') && wants === 'refund';
}

/** Damaged and wrong items are the store's mistake: the courier visit is free. */
export function isStoreFault(kind: ReturnKind): boolean {
  return kind === 'damaged' || kind === 'wrong-item';
}

/**
 * Still in progress: Requested, Approved, or Received while a refund is still to send. An
 * exchange-only request ends at Received.
 */
export function isOpenReturn(status: ReturnStatus, hasRefund: boolean): boolean {
  if (status === 'requested' || status === 'approved') return true;
  return status === 'received' && hasRefund;
}

/** Pieces in a Rejected or Cancelled request can be asked for again; all others are taken. */
export function returnHoldsPieces(status: ReturnStatus): boolean {
  return status !== 'rejected' && status !== 'cancelled';
}

/**
 * The statuses a request may move to next. `byShopper` asks for the shopper's own move
 * (Cancelled while Requested); staff get Approved, Rejected, Received and Refund Sent.
 */
export function nextReturnStatuses(
  status: ReturnStatus,
  hasRefund: boolean,
  byShopper = false,
): ReturnStatus[] {
  if (byShopper) return status === 'requested' ? ['cancelled'] : [];
  switch (status) {
    case 'requested':
      return ['approved', 'rejected'];
    case 'approved':
      return ['received', 'rejected'];
    case 'received':
      return hasRefund ? ['refund-sent'] : [];
    default:
      return [];
  }
}

/** `#R-` + first 6 characters of the request id in capitals, like the order ref (`#A1B2C3`). */
export function returnRef(requestId: string): string {
  return `#R-${requestId.slice(0, 6).toUpperCase()}`;
}

// ── The order's `returns` summary ───────────────────────────────────────────

export interface ReturnSummaryItem {
  /** Index in the order's `pricing.lines`. */
  readonly lineIndex: number;
  readonly quantity: number;
  /** Pieces paid back in money (Return It, or Refund for Damaged / Wrong Item Sent). */
  readonly refund: boolean;
  /** A gift that came back with a refunded item. */
  readonly autoGift: boolean;
  /**
   * What was asked (`Size M → L`), the same words staff see on `returnRequests/{id}`.
   */
  readonly askedLabel?: string;
}

/**
 * One entry of the order's `returns` array (written only by the server). `storeFault`,
 * `refundEgp`, `rejectReason` and each item's `askedLabel` are what the shopper's request box
 * shows (ATS-296): older entries have none, the website reads them with `readRequestDetails()`,
 * and `readReturnSummaries()` leaves them out. The summary never carries the InstaPay details,
 * the staff history or staff notes, because shoppers (and guests, through `orderViews`) read it.
 */
export interface ReturnSummary {
  readonly id: string;
  readonly ref: string;
  readonly status: ReturnStatus;
  /** True when any item is a refund (the request then goes on to Refund Sent). */
  readonly hasRefund: boolean;
  readonly items: readonly ReturnSummaryItem[];
  /** When the request was sent, epoch ms (Firestore stores a Timestamp), or null. */
  readonly createdAtMs: number | null;
  /** Any item is Damaged or Wrong Item Sent (free courier, Send Photos on WhatsApp). */
  readonly storeFault?: boolean;
  /** Refund after the courier fee, whole EGP (`returnRequests/{id}.refundEgp`); after Refund Sent, what was sent. */
  readonly refundEgp?: number;
  /** Why staff rejected it, as the shopper sees it (Rejected only). */
  readonly rejectReason?: string;
}

/** Reads the order's `returns` field; unreadable entries are skipped. */
export function readReturnSummaries(raw: unknown): ReturnSummary[] {
  if (!Array.isArray(raw)) return [];
  const out: ReturnSummary[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = entry['id'];
    const status = entry['status'];
    if (typeof id !== 'string' || !id || !isReturnStatus(status)) continue;
    const items: ReturnSummaryItem[] = [];
    if (Array.isArray(entry['items'])) {
      for (const item of entry['items']) {
        if (!isRecord(item)) continue;
        const lineIndex = item['lineIndex'];
        const quantity = item['quantity'];
        if (!isWhole(lineIndex) || !isWhole(quantity) || quantity < 1) continue;
        items.push({
          lineIndex,
          quantity,
          refund: item['refund'] === true,
          autoGift: item['autoGift'] === true,
        });
      }
    }
    out.push({
      id,
      ref: typeof entry['ref'] === 'string' ? entry['ref'] : returnRef(id),
      status,
      hasRefund: entry['hasRefund'] === true,
      items,
      createdAtMs: timestampMs(entry['createdAt']),
    });
  }
  return out;
}

/** What a status change also saves on the summary entry, as the shopper sees it. */
export interface ReturnStatusExtras {
  /** Rejected: the reason the shopper sees (trimmed; an empty one is not written). */
  readonly rejectReason?: string | null;
  /** Refund Sent: the amount staff really sent, whole EGP (replaces the expected `refundEgp`). */
  readonly refundSentEgp?: number | null;
}

/**
 * The order's raw `returns` array with one request's status changed (other fields and entries
 * kept as they are). Every callable that moves a request uses this, so the summary always matches
 * `returnRequests/{id}`. Reject passes its reason and Refund Sent the amount sent, so the shopper's
 * request box shows them on any device.
 */
export function withReturnStatus(
  raw: unknown,
  requestId: string,
  status: ReturnStatus,
  extras: ReturnStatusExtras = {},
): unknown[] {
  if (!Array.isArray(raw)) return [];
  const patch: Record<string, unknown> = { status };
  const reason = extras.rejectReason?.trim();
  if (status === 'rejected' && reason) patch['rejectReason'] = reason;
  const sent = extras.refundSentEgp;
  if (status === 'refund-sent' && typeof sent === 'number' && Number.isFinite(sent)) {
    patch['refundEgp'] = wholeOrZero(sent);
  }
  return raw.map((entry: unknown) =>
    isRecord(entry) && entry['id'] === requestId ? { ...entry, ...patch } : entry,
  );
}

// ── Who and when ────────────────────────────────────────────────────────────

export interface ReturnOrderFacts {
  readonly status: unknown;
  /** `deliveredAt` in epoch ms, or null. */
  readonly deliveredAtMs: number | null;
  /** `pricing.isInternational`: orders shipped outside Egypt can't send a request. */
  readonly isInternational: boolean;
  readonly returns: readonly ReturnSummary[];
}

export type ReturnRefusal =
  'not-delivered' | 'no-delivery-date' | 'abroad' | 'window-closed' | 'open-request' | 'too-many-requests';

export type ReturnEligibility =
  | { readonly ok: true; readonly closesAtMs: number }
  | { readonly ok: false; readonly reason: ReturnRefusal; readonly message: string };

const ASK_ON_WHATSAPP = 'Please message us on WhatsApp about a return or exchange for this order.';

/** Plain message for each refusal (the callable and the website say the same words). */
export function returnRefusalMessage(reason: ReturnRefusal): string {
  switch (reason) {
    case 'not-delivered':
      return 'You can ask for a return or exchange once your order is delivered.';
    case 'no-delivery-date':
    case 'abroad':
      return ASK_ON_WHATSAPP;
    case 'window-closed':
      return `Returns and exchanges close ${RETURN_WINDOW_DAYS} days after delivery. Please message us on WhatsApp.`;
    case 'open-request':
      return 'This order already has a return or exchange in progress. You can send another once it is done.';
    case 'too-many-requests':
      return ASK_ON_WHATSAPP;
  }
}

/**
 * Whether this order can send a return or exchange request at `nowMs`: Delivered, shipped in
 * Egypt, with a `deliveredAt` at most 14 days ago, no open request and fewer than
 * `RETURN_REQUESTS_PER_ORDER_MAX` requests so far.
 */
export function returnEligibility(order: ReturnOrderFacts, nowMs: number): ReturnEligibility {
  const refuse = (reason: ReturnRefusal): ReturnEligibility => ({
    ok: false,
    reason,
    message: returnRefusalMessage(reason),
  });
  if (order.status !== 'delivered') return refuse('not-delivered');
  if (order.isInternational) return refuse('abroad');
  if (order.deliveredAtMs === null) return refuse('no-delivery-date');
  const closesAtMs = order.deliveredAtMs + RETURN_WINDOW_DAYS * DAY_MS;
  if (nowMs > closesAtMs) return refuse('window-closed');
  if (order.returns.some((entry) => isOpenReturn(entry.status, entry.hasRefund)))
    return refuse('open-request');
  if (order.returns.length >= RETURN_REQUESTS_PER_ORDER_MAX) return refuse('too-many-requests');
  return { ok: true, closesAtMs };
}

// ── Order lines ─────────────────────────────────────────────────────────────

/** One `pricing.lines` entry, as returns read it. */
export interface ReturnOrderLine {
  readonly index: number;
  readonly productId: string;
  readonly selection: Readonly<Record<string, string>>;
  readonly quantity: number;
  /** What was paid for the whole line after offers, whole EGP (`lineDisplay`); 0 for a gift. */
  readonly paidEgp: number;
  /** For a free gift line: the index of the bought line it came with; null otherwise. */
  readonly giftForLine: number | null;
  readonly name: string;
  readonly optionLabels: readonly { readonly label: string; readonly value: string }[];
  readonly imagePath: string | null;
}

/**
 * Reads `pricing.lines`, keeping each line's index. Lines that can't be read stay in the list
 * with quantity 0 so indexes never shift.
 */
export function readReturnOrderLines(rawLines: unknown): ReturnOrderLine[] {
  if (!Array.isArray(rawLines)) return [];
  return rawLines.map((raw, index): ReturnOrderLine => {
    const line = isRecord(raw) ? raw : {};
    const quantity = isWhole(line['quantity']) ? line['quantity'] : 0;
    const gift = isRecord(line['gift']) ? line['gift'] : null;
    const forLine = gift ? gift['forLine'] : null;
    return {
      index,
      productId: typeof line['productId'] === 'string' ? line['productId'] : '',
      selection: readSelection(line['selection']),
      quantity,
      paidEgp: gift ? 0 : linePaidEgp(line, quantity),
      giftForLine: gift && isWhole(forLine) ? forLine : null,
      name: typeof line['name'] === 'string' ? line['name'].trim() : '',
      optionLabels: readOptionLabels(line['optionLabels']),
      imagePath: typeof line['imagePath'] === 'string' && line['imagePath'] ? line['imagePath'] : null,
    };
  });
}

/** `lineDisplay` (after offers); older lines: `fullEgp − discountEgp`, else `unitEgp × quantity`. */
function linePaidEgp(line: Readonly<Record<string, unknown>>, quantity: number): number {
  const display = line['lineDisplay'];
  if (typeof display === 'number' && Number.isFinite(display)) return Math.max(0, Math.round(display));
  const discount = wholeOrZero(line['discountEgp']);
  const full =
    typeof line['fullEgp'] === 'number'
      ? wholeOrZero(line['fullEgp'])
      : wholeOrZero(line['unitEgp']) * quantity;
  return Math.max(0, full - discount);
}

/** Pieces of each line not yet in a request that holds pieces (by line index). */
export function piecesLeft(lines: readonly ReturnOrderLine[], returns: readonly ReturnSummary[]): number[] {
  const left = lines.map((line) => line.quantity);
  for (const entry of returns) {
    if (!returnHoldsPieces(entry.status)) continue;
    for (const item of entry.items) {
      if (item.lineIndex >= 0 && item.lineIndex < left.length) {
        left[item.lineIndex] = Math.max(0, left[item.lineIndex]! - item.quantity);
      }
    }
  }
  return left;
}

// ── Free gifts ──────────────────────────────────────────────────────────────

export interface ReturnGiftBack {
  /** The gift line's index. */
  readonly lineIndex: number;
  /** The bought line it comes back with. */
  readonly forLine: number;
  readonly quantity: number;
}

/**
 * Gifts that come back with a refund. Gifts stay with the shopper on any exchange. Over all the
 * order's requests, a bought line's refunded pieces bring back
 * floor(refunded pieces × gift pieces ÷ line pieces) of each of its gift lines, and all of them
 * once every piece of the line is refunded. This request sends back what that adds now, never
 * more than the gift pieces still left after the shopper's own items on that gift line.
 *
 * `leftBefore`: pieces left on each line before this request (`piecesLeft`). `askedNow`: pieces
 * of each line the shopper put in this request (any kind). `refunds`: this request's refund
 * items. `returns`: the order's earlier requests (only those that hold pieces count).
 */
export function giftsBack(
  lines: readonly ReturnOrderLine[],
  refunds: readonly { readonly lineIndex: number; readonly quantity: number }[],
  leftBefore: readonly number[],
  askedNow: readonly number[],
  returns: readonly ReturnSummary[] = [],
): ReturnGiftBack[] {
  const refundedNow = new Map<number, number>();
  for (const refund of refunds) {
    refundedNow.set(refund.lineIndex, (refundedNow.get(refund.lineIndex) ?? 0) + refund.quantity);
  }
  const refundedBefore = earlierPieces(returns, (item) => item.refund);
  const giftsBefore = earlierPieces(returns, (item) => item.autoGift);
  const out: ReturnGiftBack[] = [];
  for (const [lineIndex, now] of refundedNow) {
    const bought = lines[lineIndex];
    if (!bought || bought.giftForLine !== null || bought.quantity < 1 || now < 1) continue;
    const refunded = Math.min(bought.quantity, (refundedBefore.get(lineIndex) ?? 0) + now);
    for (const gift of lines) {
      if (gift.giftForLine !== bought.index || gift.quantity < 1) continue;
      const target =
        refunded >= bought.quantity
          ? gift.quantity
          : Math.floor((refunded * gift.quantity) / bought.quantity);
      const due = target - (giftsBefore.get(gift.index) ?? 0);
      const giftLeft = Math.max(0, (leftBefore[gift.index] ?? 0) - (askedNow[gift.index] ?? 0));
      const quantity = Math.min(giftLeft, due);
      if (quantity > 0) out.push({ lineIndex: gift.index, forLine: bought.index, quantity });
    }
  }
  return out;
}

/** Pieces per line in earlier requests that hold pieces, counting only the items `pick` keeps. */
function earlierPieces(
  returns: readonly ReturnSummary[],
  pick: (item: ReturnSummaryItem) => boolean,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const entry of returns) {
    if (!returnHoldsPieces(entry.status)) continue;
    for (const item of entry.items) {
      if (pick(item)) out.set(item.lineIndex, (out.get(item.lineIndex) ?? 0) + item.quantity);
    }
  }
  return out;
}

/** Refunded pieces per line in the order's earlier requests that hold pieces. */
export function refundedBefore(returns: readonly ReturnSummary[]): Map<number, number> {
  return earlierPieces(returns, (item) => item.refund);
}

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * What was paid for `quantity` pieces of the line: lineDisplay ÷ line pieces × pieces (whole EGP).
 * `alreadyRefunded`: pieces of this line refunded before (earlier requests or items).
 */
export function refundEgpFor(line: ReturnOrderLine, quantity: number, alreadyRefunded = 0): number {
  if (line.quantity < 1 || quantity < 1 || line.giftForLine !== null) return 0;
  // Rounded on the running total, so every refund of the line together is exactly what was paid.
  const share = (pieces: number): number =>
    pieces >= line.quantity ? line.paidEgp : Math.round((line.paidEgp * pieces) / line.quantity);
  const before = Math.max(0, Math.min(line.quantity, alreadyRefunded));
  return share(before + quantity) - share(before);
}

export interface CourierFeeInput {
  /** The order's own delivery fee (`pricing.shipping.priceEgp`; the agreed fee for `domestic-agreed`). */
  readonly orderFeeEgp: number;
  /** The box's normal price in `settings/shipping`, used when the order's fee was 0 (free shipping). */
  readonly normalBoxFeeEgp: number;
  /** Any item is Damaged or Wrong Item Sent: the store pays. */
  readonly storeFault: boolean;
}

/** The Egypt boxes of `settings/shipping`, as the courier fee reads them. */
export interface ReturnBoxSettings {
  readonly egyptBoxes: readonly { readonly id: string; readonly feeEgp: number }[];
}

/**
 * The normal price of the order's Egypt box in `settings/shipping`, used for the courier fee when
 * the order's own delivery fee was 0 (a free shipping offer). An order with no box (or a box no
 * longer listed) uses the biggest Egypt box's price. `requestReturn` and the request screen both
 * call this, so the fee the shopper sees is the fee the server saves.
 */
export function normalBoxFeeEgp(settings: ReturnBoxSettings | null | undefined, boxId: unknown): number {
  const boxes = settings?.egyptBoxes ?? [];
  const box = boxes.find((entry) => entry.id === boxId);
  if (box) return wholeOrZero(box.feeEgp);
  return boxes.reduce((max, entry) => Math.max(max, wholeOrZero(entry.feeEgp)), 0);
}

/** The courier fee for the return visit (whole EGP). */
export function courierFeeEgp(input: CourierFeeInput): number {
  if (input.storeFault) return 0;
  const own = wholeOrZero(input.orderFeeEgp);
  return own > 0 ? own : wholeOrZero(input.normalBoxFeeEgp);
}

/** How the courier fee is paid: free, taken off the refund, or cash at the door (exchange only). */
export type CourierFeePaid = 'free' | 'off-refund' | 'cash';

export interface ReturnMoney {
  /** What the refunded pieces were paid (whole EGP). */
  readonly itemsEgp: number;
  readonly feeEgp: number;
  readonly feePaid: CourierFeePaid;
  /** Sent by InstaPay after the items are Received: items − fee, never below 0. */
  readonly refundEgp: number;
  /** Paid to the courier in cash: the fee for an exchange-only request, or what the refund can't cover. */
  readonly cashAtDoorEgp: number;
}

/**
 * Refund and fee for a request. The fee is taken off the refund when there is one, or paid in
 * cash to the courier for an exchange-only request. The original delivery fee is never refunded.
 */
export function returnMoney(itemsEgp: number, feeEgp: number, hasRefund: boolean): ReturnMoney {
  const items = wholeOrZero(itemsEgp);
  const fee = wholeOrZero(feeEgp);
  if (fee === 0) {
    return {
      itemsEgp: items,
      feeEgp: 0,
      feePaid: 'free',
      refundEgp: hasRefund ? items : 0,
      cashAtDoorEgp: 0,
    };
  }
  if (!hasRefund) {
    return { itemsEgp: items, feeEgp: fee, feePaid: 'cash', refundEgp: 0, cashAtDoorEgp: fee };
  }
  return {
    itemsEgp: items,
    feeEgp: fee,
    feePaid: 'off-refund',
    refundEgp: Math.max(0, items - fee),
    cashAtDoorEgp: Math.max(0, fee - items),
  };
}

// ── Stock plan ──────────────────────────────────────────────────────────────

export interface StockPieceRef {
  readonly productId: string;
  readonly selection: Readonly<Record<string, string>>;
}

/** Pieces to take from or put back into stock (feeds `aggregateOrderStockDemand`). */
export interface StockPiece extends StockPieceRef {
  readonly quantity: number;
}

export interface ReturnStockItem {
  readonly kind: ReturnKind;
  readonly wants: ReturnWants | null;
  readonly quantity: number;
  /** The piece on the order line. */
  readonly ordered: StockPieceRef;
  /** Different Size / Different Colour: the new piece. */
  readonly newPiece?: StockPieceRef | null;
  /** Wrong Item Sent: the piece actually sent, chosen by staff at Approve (ticket 3). */
  readonly sentPiece?: StockPieceRef | null;
  /** Whether the piece coming back can be sold again; default off for Damaged, on for the rest. */
  readonly canBeSoldAgain?: boolean | null;
}

export interface StockStep {
  readonly take: readonly StockPiece[];
  readonly putBack: readonly StockPiece[];
}

export interface ReturnStockPlan {
  readonly approve: StockStep;
  readonly received: StockStep;
  /** Indexes of items that can't be planned yet: a wrong item with no `sentPiece`, an exchange with no `newPiece`. */
  readonly missing: readonly number[];
}

/**
 * Turns a request into the stock moves of each step (the moves themselves happen in ticket 3):
 *
 * | Kind | At Approve | At Received |
 * | Different Size / Colour | new piece −1 | returned piece +1 (if it can be sold again) |
 * | Return It | nothing | piece +1 (if it can be sold again) |
 * | Damaged · Send Another | same piece −1 | nothing by default |
 * | Damaged · Refund | nothing | nothing by default |
 * | Wrong · Send the Right One | sent piece −1 (ordered +1 then −1 = no change) | sent piece +1 |
 * | Wrong · Refund | sent piece −1, ordered piece +1 | sent piece +1 |
 *
 * Rejecting or cancelling after Approve undoes the Approve moves (`undoStockStep`).
 */
export function returnStockPlan(items: readonly ReturnStockItem[]): ReturnStockPlan {
  const approveTake: StockPiece[] = [];
  const approvePut: StockPiece[] = [];
  const receivedPut: StockPiece[] = [];
  const missing: number[] = [];

  items.forEach((item, index) => {
    const quantity = item.quantity;
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const piece = (ref: StockPieceRef): StockPiece => ({
      productId: ref.productId,
      selection: { ...ref.selection },
      quantity,
    });
    const sellable = item.canBeSoldAgain ?? item.kind !== 'damaged';
    switch (item.kind) {
      case 'different-size':
      case 'different-colour':
        if (!item.newPiece) {
          missing.push(index);
          return;
        }
        approveTake.push(piece(item.newPiece));
        if (sellable) receivedPut.push(piece(item.ordered));
        return;
      case 'return':
        if (sellable) receivedPut.push(piece(item.ordered));
        return;
      case 'damaged':
        if (item.wants === 'send-another') approveTake.push(piece(item.ordered));
        if (sellable) receivedPut.push(piece(item.ordered));
        return;
      case 'wrong-item':
        if (!item.sentPiece) {
          missing.push(index);
          return;
        }
        approveTake.push(piece(item.sentPiece));
        // Refund: the ordered piece never left the shelf. Send the Right One: it goes back on the
        // shelf and straight out again, so nothing changes for it.
        if (item.wants === 'refund') approvePut.push(piece(item.ordered));
        if (sellable) receivedPut.push(piece(item.sentPiece));
        return;
    }
  });

  return {
    approve: { take: approveTake, putBack: approvePut },
    received: { take: [], putBack: receivedPut },
    missing,
  };
}

/** The moves that undo a step (Rejected or Cancelled after Approve). */
export function undoStockStep(step: StockStep): StockStep {
  return { take: step.putBack, putBack: step.take };
}

// ── WhatsApp messages ───────────────────────────────────────────────────────

/** What the shopper sends with photos of a damaged or wrong item (prefilled; Arabic like the order messages). */
export function returnPhotosWhatsappText(ref: string, orderRef: string): string {
  return `مرحباً، دي صور المنتج لطلب الاسترجاع أو الاستبدال رقم ${ref} (طلب رقم ${orderRef}).`;
}

/** What staff send the shopper about a new request (prefilled; staff can edit it). */
export function returnStaffWhatsappText(
  ref: string,
  orderRef: string,
  shopperName: string,
  storeName: string,
): string {
  const first = shopperName.trim().split(/\s+/)[0] ?? '';
  return `أهلاً${first ? ` ${first}` : ''}، معاك ${storeName} بخصوص طلب الاسترجاع أو الاستبدال رقم ${ref} لطلبك رقم ${orderRef}. هنتفق معاك على ميعاد المندوب.`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readSelection(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function readOptionLabels(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; value: string }[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const label = typeof entry['label'] === 'string' ? entry['label'].trim() : '';
    const value = typeof entry['value'] === 'string' ? entry['value'].trim() : '';
    if (label && value) out.push({ label, value });
  }
  return out;
}

/** Firestore Timestamp (or Date / epoch ms) → epoch ms, else null. */
export function timestampMs(raw: unknown): number | null {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (isRecord(raw) && typeof raw['toMillis'] === 'function') {
    const ms = (raw as { toMillis: () => unknown }).toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function wholeOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
