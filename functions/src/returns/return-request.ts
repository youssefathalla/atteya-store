/**
 * Reads a `requestReturn` call and builds the `returnRequests/{id}` document from the order and
 * the product docs (ATS-291). Pure: no Firestore, so every refusal is unit tested
 * (`returns/returns.test.ts`). The shared rules live in `../store/returns.ts`.
 */
import { COLOR_PALETTE } from '../products/catalog-taxonomy.js';
import { readSizeValueIds } from '../products/stock.js';
import {
  courierFeeEgp,
  giftsBack,
  isRefundItem,
  isReturnKind,
  isReturnReason,
  isStoreFault,
  piecesLeft,
  readReturnOrderLines,
  readReturnSummaries,
  refundEgpFor,
  refundedBefore,
  returnEligibility,
  returnMoney,
  returnReasonLabel,
  returnRef,
  returnWantsLabel,
  RETURN_NOTE_MAX,
  RETURN_REFUND_TO_MAX,
  timestampMs,
  wantsFor,
  type CourierFeePaid,
  type ReturnKind,
  type ReturnOrderLine,
  type ReturnReason,
  type ReturnSummaryItem,
  type ReturnWants,
} from '../store/returns.js';

/** Most items one request can hold. */
export const RETURN_ITEMS_MAX = 30;

/** A refusal with a plain message; the callable turns it into an HttpsError. */
export class ReturnRequestError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'failed-precondition' | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'ReturnRequestError';
  }
}

const NOT_FOUND = "We couldn't find that order. Check the link in your order email.";
const CHOOSE_ITEMS = 'Choose the items you want to return or exchange.';
const TRY_AGAIN = 'Something in your request changed. Refresh the page and try again.';

export interface ReturnItemInput {
  readonly lineIndex: number;
  readonly quantity: number;
  readonly kind: ReturnKind;
  readonly reason: ReturnReason | null;
  readonly wants: ReturnWants | null;
  /** Different Size / Different Colour: the new size id. */
  readonly size: string | null;
  /** Different Colour: the product id of the other colour. */
  readonly colourProductId: string | null;
}

export interface RequestReturnInput {
  readonly orderId: string;
  readonly viewKey: string | null;
  readonly items: readonly ReturnItemInput[];
  readonly note: string | null;
  readonly refundTo: string | null;
}

/** An order id: letters and digits only (Firestore auto ids). */
export function isOrderIdShape(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,128}$/.test(value);
}

/** A product id as the catalogue writes them: no slashes, at most 200 characters. */
function isProductIdShape(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
}

function isOptionIdShape(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100;
}

/** Reads the call's data. Throws `ReturnRequestError` with a plain message. */
export function parseRequestReturn(raw: unknown): RequestReturnInput {
  if (!isRecord(raw)) throw new ReturnRequestError('invalid-argument', NOT_FOUND);
  const orderId = raw['orderId'];
  if (!isOrderIdShape(orderId)) throw new ReturnRequestError('invalid-argument', NOT_FOUND);
  const viewKeyRaw = raw['viewKey'];
  const viewKey = typeof viewKeyRaw === 'string' && viewKeyRaw.length > 0 ? viewKeyRaw : null;

  const rawItems = raw['items'];
  if (!Array.isArray(rawItems) || rawItems.length === 0)
    throw new ReturnRequestError('invalid-argument', CHOOSE_ITEMS);
  if (rawItems.length > RETURN_ITEMS_MAX) {
    throw new ReturnRequestError(
      'invalid-argument',
      'That is too many items for one request. Please message us on WhatsApp.',
    );
  }
  const items = rawItems.map(parseItem);

  const note = cleanText(raw['note'], RETURN_NOTE_MAX, `Keep your note under ${RETURN_NOTE_MAX} characters.`);
  const refundTo = cleanText(
    raw['refundTo'],
    RETURN_REFUND_TO_MAX,
    'Check your InstaPay number or address. It looks too long.',
  );
  const anyRefund = items.some((item) => isRefundItem(item.kind, item.wants));
  if (anyRefund && !refundTo) {
    throw new ReturnRequestError(
      'invalid-argument',
      'Add your InstaPay number or address so we can send your refund.',
    );
  }
  return { orderId, viewKey, items, note, refundTo: anyRefund ? refundTo : null };
}

function parseItem(raw: unknown): ReturnItemInput {
  if (!isRecord(raw)) throw new ReturnRequestError('invalid-argument', CHOOSE_ITEMS);
  const lineIndex = raw['lineIndex'];
  const quantity = raw['quantity'];
  const kind = raw['kind'];
  if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > 500) {
    throw new ReturnRequestError('invalid-argument', CHOOSE_ITEMS);
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new ReturnRequestError('invalid-argument', 'Choose how many pieces of each item.');
  }
  if (!isReturnKind(kind)) {
    throw new ReturnRequestError('invalid-argument', 'Choose what you would like for each item.');
  }

  let reason: ReturnReason | null = null;
  if (kind === 'return') {
    if (!isReturnReason(raw['reason'])) {
      throw new ReturnRequestError('invalid-argument', 'Tell us why you are returning each item.');
    }
    reason = raw['reason'];
  }

  let wants: ReturnWants | null = null;
  const allowedWants = wantsFor(kind);
  if (allowedWants.length > 0) {
    const picked = raw['wants'];
    if (typeof picked !== 'string' || !(allowedWants as readonly string[]).includes(picked)) {
      throw new ReturnRequestError(
        'invalid-argument',
        kind === 'damaged'
          ? 'Choose Send Another or Refund for the damaged item.'
          : 'Choose Send the Right One or Refund for the wrong item.',
      );
    }
    wants = picked as ReturnWants;
  }

  let size: string | null = null;
  let colourProductId: string | null = null;
  if (kind === 'different-size' || kind === 'different-colour') {
    const sizeRaw = raw['size'];
    if (sizeRaw !== undefined && sizeRaw !== null) {
      if (!isOptionIdShape(sizeRaw)) throw new ReturnRequestError('invalid-argument', 'Choose a size.');
      size = sizeRaw;
    }
    if (kind === 'different-size' && size === null)
      throw new ReturnRequestError('invalid-argument', 'Choose a size.');
  }
  if (kind === 'different-colour') {
    const colourRaw = raw['colourProductId'];
    if (!isProductIdShape(colourRaw)) throw new ReturnRequestError('invalid-argument', 'Choose a colour.');
    colourProductId = colourRaw;
  }
  return { lineIndex, quantity, kind, reason, wants, size, colourProductId };
}

function cleanText(raw: unknown, max: number, tooLong: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new ReturnRequestError('invalid-argument', tooLong);
  const trimmed = raw.trim();
  if (trimmed.length > max) throw new ReturnRequestError('invalid-argument', tooLong);
  return trimmed || null;
}

/** The product ids the request needs to read: each line's product and each new colour. */
export function productIdsFor(order: Readonly<Record<string, unknown>>, input: RequestReturnInput): string[] {
  const lines = readReturnOrderLines(pricingOf(order)['lines']);
  const ids = new Set<string>();
  for (const item of input.items) {
    const line = lines[item.lineIndex];
    if (
      (item.kind === 'different-size' || item.kind === 'different-colour') &&
      isProductIdShape(line?.productId)
    ) {
      ids.add(line.productId);
    }
    if (item.colourProductId) ids.add(item.colourProductId);
  }
  return [...ids];
}

// ── Building the request ────────────────────────────────────────────────────

export interface StoredReturnItem {
  readonly lineIndex: number;
  readonly quantity: number;
  readonly kind: ReturnKind;
  readonly reason: ReturnReason | null;
  readonly wants: ReturnWants | null;
  /** Paid back in money (Return It, or Refund for Damaged / Wrong Item Sent). */
  readonly refund: boolean;
  /** The order line is a free gift. */
  readonly gift: boolean;
  /** Added by the server: a gift that comes back with a refunded item (`forLine`). */
  readonly autoGift: boolean;
  readonly forLine: number | null;
  readonly productId: string;
  readonly selection: Readonly<Record<string, string>>;
  readonly name: string;
  readonly optionLabels: readonly { readonly label: string; readonly value: string }[];
  readonly imagePath: string | null;
  /** Different Size / Different Colour: the new piece. */
  readonly newProductId: string | null;
  readonly newSelection: Readonly<Record<string, string>> | null;
  /** What was asked, e.g. `Size M → L`, `Return · Didn't fit`, `Damaged · Send Another`. */
  readonly askedLabel: string;
  /** What the refunded pieces were paid (whole EGP); 0 for exchanges and gifts. */
  readonly refundEgp: number;
}

export interface ReturnCustomer {
  readonly customerId: string | null;
  readonly guest: boolean;
  readonly email: string | null;
  readonly name: string;
  readonly phone: string;
  readonly country: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
}

export interface BuiltReturnRequest {
  readonly ref: string;
  readonly orderId: string;
  readonly orderRef: string;
  readonly customer: ReturnCustomer;
  readonly items: readonly StoredReturnItem[];
  readonly note: string | null;
  readonly refundTo: string | null;
  readonly hasRefund: boolean;
  readonly storeFault: boolean;
  readonly itemsEgp: number;
  readonly feeEgp: number;
  readonly feePaid: CourierFeePaid;
  readonly refundEgp: number;
  readonly cashAtDoorEgp: number;
  readonly deliveredAtMs: number | null;
  /** The order's `returns` summary entry, without its time stamp. */
  readonly summaryItems: readonly ReturnSummaryItem[];
}

export interface BuildReturnInput {
  readonly requestId: string;
  readonly orderId: string;
  readonly order: Readonly<Record<string, unknown>>;
  readonly input: RequestReturnInput;
  /** Product docs by id (undefined when missing). */
  readonly products: ReadonlyMap<string, Readonly<Record<string, unknown>> | undefined>;
  /** The order box's normal price in `settings/shipping` (used when the order's fee was 0). */
  readonly normalBoxFeeEgp: number;
  readonly nowMs: number;
}

/** Checks the request against the order and products and builds what is saved. */
export function buildReturnRequest(build: BuildReturnInput): BuiltReturnRequest {
  const { order, input } = build;
  const pricing = pricingOf(order);
  const returns = readReturnSummaries(order['returns']);
  const deliveredAtMs = timestampMs(order['deliveredAt']);
  const eligibility = returnEligibility(
    {
      status: order['status'],
      deliveredAtMs,
      isInternational: pricing['isInternational'] === true,
      returns,
    },
    build.nowMs,
  );
  if (!eligibility.ok) throw new ReturnRequestError('failed-precondition', eligibility.message);

  const lines = readReturnOrderLines(pricing['lines']);
  const leftBefore = piecesLeft(lines, returns);
  const refunded = refundedBefore(returns);
  const askedNow = lines.map(() => 0);
  const items: StoredReturnItem[] = [];

  for (const item of input.items) {
    const line = lines[item.lineIndex];
    if (!line || line.quantity < 1 || !line.productId)
      throw new ReturnRequestError('invalid-argument', TRY_AGAIN);
    askedNow[line.index] = (askedNow[line.index] ?? 0) + item.quantity;
    const stored = storedItem(line, item, build.products, refunded.get(line.index) ?? 0);
    if (stored.refund) refunded.set(line.index, (refunded.get(line.index) ?? 0) + item.quantity);
    items.push(stored);
  }
  for (const line of lines) {
    if ((askedNow[line.index] ?? 0) > (leftBefore[line.index] ?? 0)) {
      throw new ReturnRequestError(
        'failed-precondition',
        'Some of these pieces are already in a request, or that is more pieces than you have.',
      );
    }
  }

  const refunds = items.filter((item) => item.refund);
  for (const back of giftsBack(lines, refunds, leftBefore, askedNow, returns)) {
    const gift = lines[back.lineIndex]!;
    const bought = lines[back.forLine]!;
    items.push({
      lineIndex: gift.index,
      quantity: back.quantity,
      kind: 'return',
      reason: null,
      wants: null,
      refund: false,
      gift: true,
      autoGift: true,
      forLine: bought.index,
      productId: gift.productId,
      selection: { ...gift.selection },
      name: gift.name,
      optionLabels: gift.optionLabels,
      imagePath: gift.imagePath,
      newProductId: null,
      newSelection: null,
      askedLabel: `Free gift · comes back with ${bought.name || 'the item'}`,
      refundEgp: 0,
    });
  }

  const hasRefund = refunds.length > 0;
  const storeFault = items.some((item) => isStoreFault(item.kind));
  const itemsEgp = refunds.reduce((sum, item) => sum + item.refundEgp, 0);
  const shipping = isRecord(pricing['shipping']) ? pricing['shipping'] : {};
  const fee = courierFeeEgp({
    orderFeeEgp: wholeOrZero(shipping['priceEgp']),
    normalBoxFeeEgp: build.normalBoxFeeEgp,
    storeFault,
  });
  const money = returnMoney(itemsEgp, fee, hasRefund);

  return {
    ref: returnRef(build.requestId),
    orderId: build.orderId,
    orderRef: `#${build.orderId.slice(0, 6).toUpperCase()}`,
    customer: readCustomer(order),
    items,
    note: input.note,
    refundTo: hasRefund ? input.refundTo : null,
    hasRefund,
    storeFault,
    itemsEgp: money.itemsEgp,
    feeEgp: money.feeEgp,
    feePaid: money.feePaid,
    refundEgp: money.refundEgp,
    cashAtDoorEgp: money.cashAtDoorEgp,
    deliveredAtMs,
    summaryItems: items.map((item) => ({
      lineIndex: item.lineIndex,
      quantity: item.quantity,
      refund: item.refund,
      autoGift: item.autoGift,
    })),
  };
}

function storedItem(
  line: ReturnOrderLine,
  item: ReturnItemInput,
  products: BuildReturnInput['products'],
  alreadyRefunded: number,
): StoredReturnItem {
  const isGift = line.giftForLine !== null;
  if (isGift && item.kind !== 'different-size' && item.kind !== 'different-colour') {
    throw new ReturnRequestError(
      'invalid-argument',
      'A free gift can be swapped for another size or colour, but not returned on its own.',
    );
  }
  const refund = isRefundItem(item.kind, item.wants);
  const base = {
    lineIndex: line.index,
    quantity: item.quantity,
    kind: item.kind,
    reason: item.reason,
    wants: item.wants,
    refund,
    gift: isGift,
    autoGift: false,
    forLine: line.giftForLine,
    productId: line.productId,
    selection: { ...line.selection },
    name: line.name,
    optionLabels: line.optionLabels,
    imagePath: line.imagePath,
    newProductId: null,
    newSelection: null,
    refundEgp: refund ? refundEgpFor(line, item.quantity, alreadyRefunded) : 0,
  };

  switch (item.kind) {
    case 'return':
      return { ...base, askedLabel: `Return · ${returnReasonLabel(item.reason ?? 'other')}` };
    case 'damaged':
      return { ...base, askedLabel: `Damaged · ${returnWantsLabel(item.wants ?? 'refund')}` };
    case 'wrong-item':
      return { ...base, askedLabel: `Wrong Item · ${returnWantsLabel(item.wants ?? 'refund')}` };
    case 'different-size': {
      const product = products.get(line.productId);
      const current = line.selection['size'];
      if (!product || product['published'] === false) {
        throw new ReturnRequestError(
          'failed-precondition',
          'This item is no longer available in other sizes. Please message us on WhatsApp.',
        );
      }
      if (!current) {
        throw new ReturnRequestError(
          'failed-precondition',
          'This item comes in one size only. Please message us on WhatsApp.',
        );
      }
      const sizes = readSizeValueIds(product['options']);
      if (!item.size || !sizes.includes(item.size) || item.size === current) {
        throw new ReturnRequestError('invalid-argument', 'Choose a different size.');
      }
      const newSelection = { ...line.selection, size: item.size };
      return {
        ...base,
        newProductId: line.productId,
        newSelection,
        askedLabel: `Size ${sizeLabel(product, current)} → ${sizeLabel(product, item.size)}`,
      };
    }
    case 'different-colour': {
      const original = products.get(line.productId);
      const colourId = item.colourProductId ?? '';
      const other = products.get(colourId);
      if (!original || !other || colourId === line.productId || other['published'] === false) {
        throw new ReturnRequestError(
          'failed-precondition',
          'That colour is not available. Please choose another.',
        );
      }
      const group = original['modelGroup'];
      if (typeof group !== 'string' || !group || other['modelGroup'] !== group) {
        throw new ReturnRequestError(
          'failed-precondition',
          'That colour is not available. Please choose another.',
        );
      }
      if (productPrice(other) !== productPrice(original)) {
        throw new ReturnRequestError('failed-precondition', 'Different price, message us on WhatsApp.');
      }
      const sizes = readSizeValueIds(other['options']);
      if (sizes.length > 0 && (!item.size || !sizes.includes(item.size))) {
        throw new ReturnRequestError('invalid-argument', 'Choose a size.');
      }
      const newSelection: Record<string, string> = sizes.length > 0 && item.size ? { size: item.size } : {};
      const sizePart = newSelection['size'] ? ` · Size ${sizeLabel(other, newSelection['size'])}` : '';
      return {
        ...base,
        newProductId: colourId,
        newSelection,
        askedLabel: `${colourName(original, line)} → ${colourName(other, null)}${sizePart}`,
      };
    }
  }
}

/** The size's label (`M`) from the product's size option, else the id. */
function sizeLabel(product: Readonly<Record<string, unknown>>, sizeId: string): string {
  const options = product['options'];
  if (Array.isArray(options)) {
    for (const option of options) {
      if (!isRecord(option) || option['key'] !== 'size' || !Array.isArray(option['values'])) continue;
      for (const value of option['values']) {
        if (
          isRecord(value) &&
          value['id'] === sizeId &&
          typeof value['label'] === 'string' &&
          value['label'].trim()
        ) {
          return value['label'].trim();
        }
      }
    }
  }
  return sizeId;
}

/** The product's first colour name (`Black`), else its name. */
function colourName(product: Readonly<Record<string, unknown>>, line: ReturnOrderLine | null): string {
  const colors = product['colors'];
  const first = Array.isArray(colors) ? colors[0] : null;
  const entry = COLOR_PALETTE.find((color) => color.id === first);
  if (entry) return entry.label;
  const name = typeof product['name'] === 'string' ? product['name'].trim() : '';
  return name || line?.name || 'Other colour';
}

function productPrice(product: Readonly<Record<string, unknown>>): number {
  const price = Number(product['price'] ?? 0);
  return Number.isFinite(price) ? Math.max(0, Math.round(price)) : 0;
}

function readCustomer(order: Readonly<Record<string, unknown>>): ReturnCustomer {
  const shipping = isRecord(order['shipping']) ? order['shipping'] : {};
  const customerId = text(order['customerId']);
  const email = text(order['customerEmail']);
  return {
    customerId: customerId || null,
    guest: !customerId,
    email: email.includes('@') ? email : null,
    name: text(shipping['fullName']),
    phone: text(shipping['phone']),
    country: text(shipping['country']),
    line1: text(shipping['line1']),
    line2: text(shipping['line2']) || null,
    city: text(shipping['city']),
  };
}

function pricingOf(order: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return isRecord(order['pricing']) ? order['pricing'] : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function wholeOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
