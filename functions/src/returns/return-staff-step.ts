/**
 * The staff steps of a return or exchange request (ATS-293): Approve, Reject, Item Received and
 * Refund Sent. Pure: no Firestore, so every row of the stock plan is unit tested
 * (`returns/return-staff-step.test.ts`). The transaction that reads and writes lives in
 * `return-staff-transaction.ts`; the shared rules in `../store/returns.ts`.
 */
import { readSizeValueIds, stockFields, type StockFields } from '../products/stock.js';
import {
  isReturnKind,
  REFUND_REFERENCE_MAX,
  REJECT_REASON_MAX,
  returnStockPlan,
  undoStockStep,
  type ReturnKind,
  type ReturnStockItem,
  type ReturnWants,
  type StockPiece,
  type StockStep,
} from '../store/returns.js';

/** A refusal with a plain message; the callable turns it into an HttpsError. */
export class ReturnStepError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'failed-precondition' | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'ReturnStepError';
  }
}

const NOT_FOUND = "We couldn't find that request. Refresh the list and try again.";

// ── Reading a saved request ─────────────────────────────────────────────────

/** One saved item, as the staff steps read it from `returnRequests/{id}.items`. */
export interface StaffReturnItem {
  readonly kind: ReturnKind;
  readonly wants: ReturnWants | null;
  readonly quantity: number;
  readonly productId: string;
  readonly selection: Readonly<Record<string, string>>;
  readonly name: string;
  readonly newProductId: string | null;
  readonly newSelection: Readonly<Record<string, string>> | null;
  /** Wrong Item Sent: the piece we actually sent (chosen at Approve). */
  readonly sentProductId: string | null;
  readonly sentSelection: Readonly<Record<string, string>> | null;
  /** Chosen at Item Received; null before. */
  readonly canBeSoldAgain: boolean | null;
}

/** Reads the request's `items`; an item that can't be read refuses (stock must never guess). */
export function readStaffItems(raw: unknown): StaffReturnItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ReturnStepError('failed-precondition', 'This request has no items to handle.');
  }
  return raw.map((entry): StaffReturnItem => {
    const item = isRecord(entry) ? entry : {};
    const kind = item['kind'];
    const quantity = item['quantity'];
    const productId = item['productId'];
    if (
      !isReturnKind(kind) ||
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      typeof productId !== 'string' ||
      !productId
    ) {
      throw new ReturnStepError(
        'failed-precondition',
        'One item on this request could not be read. Please check it by hand.',
      );
    }
    const wants = item['wants'];
    return {
      kind,
      wants: wants === 'send-another' || wants === 'send-right-one' || wants === 'refund' ? wants : null,
      quantity,
      productId,
      selection: readSelection(item['selection']),
      name: typeof item['name'] === 'string' ? item['name'] : '',
      newProductId:
        typeof item['newProductId'] === 'string' && item['newProductId'] ? item['newProductId'] : null,
      newSelection: isRecord(item['newSelection']) ? readSelection(item['newSelection']) : null,
      sentProductId:
        typeof item['sentProductId'] === 'string' && item['sentProductId'] ? item['sentProductId'] : null,
      sentSelection: isRecord(item['sentSelection']) ? readSelection(item['sentSelection']) : null,
      canBeSoldAgain: typeof item['canBeSoldAgain'] === 'boolean' ? item['canBeSoldAgain'] : null,
    };
  });
}

/** The items as `returnStockPlan` reads them. */
export function stockItemsFor(items: readonly StaffReturnItem[]): ReturnStockItem[] {
  return items.map((item) => ({
    kind: item.kind,
    wants: item.wants,
    quantity: item.quantity,
    ordered: { productId: item.productId, selection: item.selection },
    newPiece: item.newProductId ? { productId: item.newProductId, selection: item.newSelection ?? {} } : null,
    sentPiece: item.sentProductId
      ? { productId: item.sentProductId, selection: item.sentSelection ?? {} }
      : null,
    canBeSoldAgain: item.kind === 'wrong-item' ? true : item.canBeSoldAgain,
  }));
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface SentPieceInput {
  /** Index in the request's `items`. */
  readonly itemIndex: number;
  readonly productId: string;
  /** Size id, or null for a product without sizes. */
  readonly size: string | null;
}

export interface ApproveInput {
  readonly requestId: string;
  readonly sent: readonly SentPieceInput[];
}

export interface RejectInput {
  readonly requestId: string;
  readonly reason: string;
}

export interface ReceiveInput {
  readonly requestId: string;
  /** Per item index: can the piece be sold again (Wrong Item Sent is ignored: always yes). */
  readonly sellable: ReadonlyMap<number, boolean>;
}

export interface RefundSentInput {
  readonly requestId: string;
  readonly amountEgp: number;
  readonly reference: string | null;
}

export function isRequestIdShape(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,128}$/.test(value);
}

function isProductIdShape(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
}

function requestIdOf(data: Record<string, unknown>): string {
  const id = data['requestId'];
  if (!isRequestIdShape(id)) throw new ReturnStepError('invalid-argument', NOT_FOUND);
  return id;
}

export function parseApprove(raw: unknown): ApproveInput {
  const data = isRecord(raw) ? raw : {};
  const requestId = requestIdOf(data);
  const sentRaw = data['sent'] ?? [];
  if (!Array.isArray(sentRaw) || sentRaw.length > 30) {
    throw new ReturnStepError('invalid-argument', 'Choose what we sent instead.');
  }
  const sent = sentRaw.map((entry): SentPieceInput => {
    const item = isRecord(entry) ? entry : {};
    const itemIndex = item['itemIndex'];
    const productId = item['productId'];
    const size = item['size'];
    if (
      typeof itemIndex !== 'number' ||
      !Number.isInteger(itemIndex) ||
      itemIndex < 0 ||
      !isProductIdShape(productId) ||
      (size !== null && size !== undefined && (typeof size !== 'string' || !size || size.length > 100))
    ) {
      throw new ReturnStepError('invalid-argument', 'Choose what we sent instead.');
    }
    return { itemIndex, productId, size: typeof size === 'string' ? size : null };
  });
  return { requestId, sent };
}

export function parseReject(raw: unknown): RejectInput {
  const data = isRecord(raw) ? raw : {};
  const requestId = requestIdOf(data);
  const reason = typeof data['reason'] === 'string' ? data['reason'].trim() : '';
  if (!reason || reason.length > REJECT_REASON_MAX) {
    throw new ReturnStepError(
      'invalid-argument',
      `Write a reason the customer will see (up to ${REJECT_REASON_MAX} characters).`,
    );
  }
  return { requestId, reason };
}

export function parseReceive(raw: unknown): ReceiveInput {
  const data = isRecord(raw) ? raw : {};
  const requestId = requestIdOf(data);
  const list = data['sellable'] ?? [];
  if (!Array.isArray(list) || list.length > 60) {
    throw new ReturnStepError('invalid-argument', 'Choose which pieces can be sold again.');
  }
  const sellable = new Map<number, boolean>();
  for (const entry of list) {
    const item = isRecord(entry) ? entry : {};
    const index = item['itemIndex'];
    const value = item['canBeSoldAgain'];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || typeof value !== 'boolean') {
      throw new ReturnStepError('invalid-argument', 'Choose which pieces can be sold again.');
    }
    sellable.set(index, value);
  }
  return { requestId, sellable };
}

export function parseRefundSent(raw: unknown): RefundSentInput {
  const data = isRecord(raw) ? raw : {};
  const requestId = requestIdOf(data);
  const amount = data['amountEgp'];
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) {
    throw new ReturnStepError('invalid-argument', 'Write the amount you sent, in whole pounds.');
  }
  const refRaw = data['reference'];
  let reference: string | null = null;
  if (refRaw !== undefined && refRaw !== null) {
    if (typeof refRaw !== 'string' || refRaw.trim().length > REFUND_REFERENCE_MAX) {
      throw new ReturnStepError(
        'invalid-argument',
        `The InstaPay reference can be up to ${REFUND_REFERENCE_MAX} characters.`,
      );
    }
    reference = refRaw.trim() || null;
  }
  return { requestId, amountEgp: amount, reference };
}

// ── Approve: choosing the piece we sent ─────────────────────────────────────

/** Product facts the steps need: stock fields, options and a name for messages. */
export interface StepProduct {
  readonly stock: unknown;
  readonly stockBySize: unknown;
  readonly options: unknown;
  readonly name: string;
}

/**
 * The items with each Wrong Item Sent's sent piece filled in from staff's choice (or kept when it
 * was saved before). Refuses when a wrong item has no choice, or a choice names a size the
 * product doesn't have.
 */
export function withSentPieces(
  items: readonly StaffReturnItem[],
  sent: readonly SentPieceInput[],
  products: ReadonlyMap<string, StepProduct | null>,
): StaffReturnItem[] {
  const byIndex = new Map(sent.map((entry) => [entry.itemIndex, entry]));
  return items.map((item, index) => {
    if (item.kind !== 'wrong-item') return item;
    const choice = byIndex.get(index);
    if (!choice) {
      if (item.sentProductId) return item;
      throw new ReturnStepError(
        'invalid-argument',
        `Choose what we sent instead of ${item.name || 'the wrong item'}.`,
      );
    }
    const product = products.get(choice.productId);
    if (!product) {
      throw new ReturnStepError('failed-precondition', 'That product no longer exists. Choose another.');
    }
    const sizes = readSizeValueIds(product.options);
    if (sizes.length > 0 && (!choice.size || !sizes.includes(choice.size))) {
      throw new ReturnStepError('invalid-argument', `Choose the size we sent of ${product.name}.`);
    }
    return {
      ...item,
      sentProductId: choice.productId,
      sentSelection: sizes.length > 0 && choice.size ? { size: choice.size } : {},
    };
  });
}

/** Product ids the Approve choice for wrong items names. */
export function sentProductIds(sent: readonly SentPieceInput[]): string[] {
  return [...new Set(sent.map((entry) => entry.productId))];
}

// ── Stock moves ─────────────────────────────────────────────────────────────

export interface StockMoveResult {
  /** The new stock fields per product id (only products that changed). */
  readonly next: ReadonlyMap<string, StockFields>;
  /** The moves that really happened (skipped pieces left out), saved so Reject undoes only these. */
  readonly applied: StockStep;
  /** Pieces that couldn't go back (the product or its size is gone). Staff check by hand. */
  readonly notReturned: number;
}

export interface StockMoveOptions {
  /**
   * `refuse` (Approve): a piece we must take that is sold out refuses the step with
   * "Size L is sold out. …", and nothing changes. `floor` (undoing Approve on Reject): a count that
   * is too low stops at 0, so a reject is never blocked.
   */
  readonly short: 'refuse' | 'floor';
}

/**
 * Applies one step's moves to the live products: pieces put back first, then pieces taken. Never
 * writes; the transaction writes `next`. Pieces whose product or size is gone count in
 * `notReturned` (puts) and refuse (takes, with `short: 'refuse'`).
 */
export function applyStockMoves(
  products: ReadonlyMap<string, StepProduct | null>,
  step: StockStep,
  opts: StockMoveOptions,
): StockMoveResult {
  const live = new Map<string, LiveStock | null>();
  const read = (productId: string): LiveStock | null => {
    if (!live.has(productId)) live.set(productId, liveStock(products.get(productId) ?? null));
    return live.get(productId) ?? null;
  };
  const changed = new Set<string>();
  const putBack: StockPiece[] = [];
  const take: StockPiece[] = [];
  let notReturned = 0;

  for (const piece of step.putBack) {
    const stock = read(piece.productId);
    const size = piece.selection['size'];
    if (!stock) {
      notReturned += piece.quantity;
      continue;
    }
    if (stock.bySize) {
      if (!size || !Object.hasOwn(stock.bySize, size)) {
        notReturned += piece.quantity;
        continue;
      }
      stock.bySize[size] = (stock.bySize[size] ?? 0) + piece.quantity;
    } else {
      stock.flat += piece.quantity;
    }
    changed.add(piece.productId);
    putBack.push(piece);
  }

  for (const piece of step.take) {
    const stock = read(piece.productId);
    const size = piece.selection['size'];
    const product = products.get(piece.productId) ?? null;
    if (!stock) {
      if (opts.short === 'floor') continue;
      throw new ReturnStepError(
        'failed-precondition',
        product
          ? `Stock is not set up for ${product.name || 'this product'}. Set its stock in Products, then approve again.`
          : 'One product on this request no longer exists. Ask the customer to pick something else or switch this item to a refund.',
      );
    }
    if (stock.bySize) {
      if (!size || !Object.hasOwn(stock.bySize, size)) {
        if (opts.short === 'floor') continue;
        throw new ReturnStepError(
          'failed-precondition',
          `${product?.name || 'This product'} no longer has that size. Ask the customer to pick another size or switch this item to a refund.`,
        );
      }
      const have = stock.bySize[size] ?? 0;
      if (have < piece.quantity) {
        if (opts.short === 'refuse') {
          throw new ReturnStepError(
            'failed-precondition',
            `Size ${sizeLabel(product, size)} is sold out. Ask the customer to pick another size or switch this item to a refund.`,
          );
        }
        stock.bySize[size] = 0;
      } else {
        stock.bySize[size] = have - piece.quantity;
      }
    } else if (stock.flat < piece.quantity) {
      if (opts.short === 'refuse') {
        throw new ReturnStepError(
          'failed-precondition',
          `${product?.name || 'This item'} is sold out. Ask the customer to pick something else or switch this item to a refund.`,
        );
      }
      stock.flat = 0;
    } else {
      stock.flat -= piece.quantity;
    }
    changed.add(piece.productId);
    take.push(piece);
  }

  const next = new Map<string, StockFields>();
  for (const productId of changed) {
    const stock = live.get(productId);
    if (!stock) continue;
    next.set(productId, stock.bySize ? stockFields(stock.bySize) : stockFields(null, stock.flat));
  }
  return { next, applied: { take, putBack }, notReturned };
}

interface LiveStock {
  bySize: Record<string, number> | null;
  flat: number;
}

/** The product's live counts; null when the product is gone or has no stock set up. */
function liveStock(product: StepProduct | null): LiveStock | null {
  if (!product) return null;
  if (isRecord(product.stockBySize)) {
    const sizeIds = readSizeValueIds(product.options);
    const ids = sizeIds.length > 0 ? sizeIds : Object.keys(product.stockBySize);
    const bySize: Record<string, number> = {};
    for (const id of ids) bySize[id] = whole(product.stockBySize[id]);
    return { bySize, flat: 0 };
  }
  if (typeof product.stock !== 'number' || !Number.isFinite(product.stock)) return null;
  return { bySize: null, flat: whole(product.stock) };
}

/** "L" from the product's size option, else the id in capitals. */
export function sizeLabel(product: StepProduct | null, sizeId: string): string {
  const options = product && Array.isArray(product.options) ? product.options : [];
  for (const option of options) {
    if (!isRecord(option) || option['key'] !== 'size' || !Array.isArray(option['values'])) continue;
    for (const value of option['values']) {
      if (isRecord(value) && value['id'] === sizeId && typeof value['label'] === 'string') {
        return value['label'];
      }
    }
  }
  return sizeId.toUpperCase();
}

/** Every product id a step touches. */
export function productIdsOf(...steps: readonly StockStep[]): string[] {
  const ids = new Set<string>();
  for (const step of steps) {
    for (const piece of [...step.take, ...step.putBack]) ids.add(piece.productId);
  }
  return [...ids];
}

// ── The step itself ─────────────────────────────────────────────────────────

/** A step saved on the request (`approveStock`) so Reject undoes exactly what Approve moved. */
export function readSavedStep(raw: unknown): StockStep {
  const data = isRecord(raw) ? raw : {};
  return { take: readPieces(data['take']), putBack: readPieces(data['putBack']) };
}

function readPieces(raw: unknown): StockPiece[] {
  if (!Array.isArray(raw)) return [];
  const out: StockPiece[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const productId = entry['productId'];
    const quantity = entry['quantity'];
    if (typeof productId !== 'string' || !productId) continue;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) continue;
    out.push({ productId, selection: readSelection(entry['selection']), quantity });
  }
  return out;
}

/** A step as plain data for Firestore. */
export function savedStep(step: StockStep): { take: StockPiece[]; putBack: StockPiece[] } {
  const plain = (pieces: readonly StockPiece[]) =>
    pieces.map((piece) => ({
      productId: piece.productId,
      selection: { ...piece.selection },
      quantity: piece.quantity,
    }));
  return { take: plain(step.take), putBack: plain(step.putBack) };
}

/** Approve: the moves for the items (every wrong item must have its sent piece by now). */
export function approveStep(items: readonly StaffReturnItem[]): StockStep {
  const plan = returnStockPlan(stockItemsFor(items));
  if (plan.missing.length > 0) {
    const item = items[plan.missing[0]!];
    throw new ReturnStepError(
      item?.kind === 'wrong-item' ? 'invalid-argument' : 'failed-precondition',
      item?.kind === 'wrong-item'
        ? `Choose what we sent instead of ${item.name || 'the wrong item'}.`
        : 'One exchange on this request has no new piece saved. Reject it and ask the customer to send a new request.',
    );
  }
  return plan.approve;
}

/** Reject after Approve: the opposite of what Approve moved. */
export function rejectUndoStep(saved: StockStep): StockStep {
  return undoStockStep(saved);
}

/**
 * Item Received: each item's "can be sold again" (on by default, off for Damaged Item; Wrong Item
 * Sent always goes back) and the moves that follow.
 */
export function receiveStep(
  items: readonly StaffReturnItem[],
  sellable: ReadonlyMap<number, boolean>,
): { items: StaffReturnItem[]; step: StockStep } {
  const chosen = items.map((item, index): StaffReturnItem => {
    const canBeSoldAgain =
      item.kind === 'wrong-item'
        ? true
        : (sellable.get(index) ?? item.canBeSoldAgain ?? item.kind !== 'damaged');
    return { ...item, canBeSoldAgain };
  });
  return { items: chosen, step: returnStockPlan(stockItemsFor(chosen)).received };
}

/** The saved items with the staff choices written back (`sentProductId`, `canBeSoldAgain`). */
export function mergeItemChoices(
  rawItems: readonly unknown[],
  items: readonly StaffReturnItem[],
): Record<string, unknown>[] {
  return rawItems.map((raw, index) => {
    const base = isRecord(raw) ? { ...raw } : {};
    const item = items[index];
    if (!item) return base;
    if (item.sentProductId) {
      base['sentProductId'] = item.sentProductId;
      base['sentSelection'] = { ...(item.sentSelection ?? {}) };
    }
    if (item.canBeSoldAgain !== null) base['canBeSoldAgain'] = item.canBeSoldAgain;
    return base;
  });
}

/** Pieces in a step. */
export function stepPieces(step: StockStep): number {
  return [...step.take, ...step.putBack].reduce((sum, piece) => sum + piece.quantity, 0);
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

function whole(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
