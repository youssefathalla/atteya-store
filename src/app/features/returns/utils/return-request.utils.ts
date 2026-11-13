import {
  courierFeeEgp,
  giftsBack,
  isRefundItem,
  isStoreFault,
  piecesLeft,
  readReturnOrderLines,
  refundEgpFor,
  refundedBefore,
  returnMoney,
  type ReturnGiftBack,
  type ReturnKind,
  type ReturnMoney,
  type ReturnOrderLine,
  type ReturnReason,
  type ReturnSummary,
  type ReturnWants,
} from '@core/config/returns';
import { COLOR_PALETTE } from '@core/services/products/catalog-taxonomy';
import type { Product } from '@core/services/products';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { normalizeImageKitPath } from '@shared/utils/image';

/** One order line on the request screen. */
export interface ReturnPickLine {
  readonly index: number;
  readonly productId: string;
  readonly selection: Readonly<Record<string, string>>;
  readonly name: string;
  /** "Black · Size M". */
  readonly details: string;
  readonly imagePath: string | null;
  readonly imageSrc: string;
  readonly quantity: number;
  /** Pieces not yet in a request. */
  readonly left: number;
  /** For a free gift: the bought line's name; null otherwise. */
  readonly giftFor: string | null;
}

/** What the shopper chose for one item. */
export interface ReturnChoice {
  readonly picked: boolean;
  readonly quantity: number;
  readonly kind: ReturnKind | null;
  readonly reason: ReturnReason | null;
  readonly wants: ReturnWants | null;
  /** Different Colour: the other colour's product id. */
  readonly colourProductId: string | null;
  /** Different Size / Different Colour: the new size id. */
  readonly size: string | null;
}

export const EMPTY_CHOICE: ReturnChoice = {
  picked: false,
  quantity: 1,
  kind: null,
  reason: null,
  wants: null,
  colourProductId: null,
  size: null,
};

const isSizeLabel = (label: string): boolean => label.trim().toLowerCase() === 'size';

/** "Black · Size M" from a line's saved option labels. */
export function lineDetails(labels: ReturnOrderLine['optionLabels']): string {
  return labels.map((opt) => (isSizeLabel(opt.label) ? `Size ${opt.value}` : opt.value)).join(' · ');
}

/** The order's lines with the pieces still returnable (lines that can't be read are left out). */
export function returnPickLines(order: OrderDoc, summaries: readonly ReturnSummary[]): ReturnPickLine[] {
  const lines = readReturnOrderLines(order.pricing.lines);
  const left = piecesLeft(lines, summaries);
  return lines
    .filter((line) => line.quantity > 0 && line.productId)
    .map((line) => ({
      index: line.index,
      productId: line.productId,
      selection: line.selection,
      name: line.name || 'Item',
      details: lineDetails(line.optionLabels),
      imagePath: line.imagePath,
      imageSrc: line.imagePath ? normalizeImageKitPath(line.imagePath) : '',
      quantity: line.quantity,
      left: left[line.index] ?? 0,
      giftFor: line.giftForLine !== null ? lines[line.giftForLine]?.name || 'your item' : null,
    }));
}

/** The kinds a line can ask for: a free gift can only be swapped for another size or colour. */
export function kindsFor(line: Pick<ReturnPickLine, 'giftFor'>): readonly ReturnKind[] {
  return line.giftFor !== null
    ? ['different-size', 'different-colour']
    : ['different-size', 'different-colour', 'return', 'damaged', 'wrong-item'];
}

/** What is still missing before the item can be sent, in plain words; null when complete. */
export function choiceProblem(
  line: ReturnPickLine,
  choice: ReturnChoice,
  hasSizes: boolean | null,
): string | null {
  const name = line.name;
  switch (choice.kind) {
    case null:
      return `Choose what you would like for ${name}.`;
    case 'different-size':
      return choice.size ? null : `Choose a new size for ${name}.`;
    case 'different-colour':
      if (!choice.colourProductId) return `Choose a colour for ${name}.`;
      return hasSizes && !choice.size ? `Choose a size for ${name}.` : null;
    case 'return':
      return choice.reason ? null : `Tell us why you are returning ${name}.`;
    case 'damaged':
    case 'wrong-item':
      return choice.wants ? null : `Choose what we should do about ${name}.`;
  }
}

/** The request's money and returned gifts, worked out with the shared rules (same as the server). */
export interface ReturnPreview {
  readonly money: ReturnMoney;
  readonly hasRefund: boolean;
  readonly storeFault: boolean;
  /** Refund (before the fee) per picked line index. */
  readonly refundByLine: ReadonlyMap<number, number>;
  readonly gifts: readonly ReturnGiftBack[];
}

export interface PreviewInput {
  readonly order: OrderDoc;
  readonly summaries: readonly ReturnSummary[];
  readonly items: readonly {
    readonly lineIndex: number;
    readonly quantity: number;
    readonly kind: ReturnKind;
    readonly wants: ReturnWants | null;
  }[];
  readonly normalBoxFeeEgp: number;
}

export function returnPreview(input: PreviewInput): ReturnPreview {
  const lines = readReturnOrderLines(input.order.pricing.lines);
  const leftBefore = piecesLeft(lines, input.summaries);
  const refunded = refundedBefore(input.summaries);
  const askedNow = lines.map(() => 0);
  const refunds: { lineIndex: number; quantity: number }[] = [];
  const refundByLine = new Map<number, number>();
  let itemsEgp = 0;
  for (const item of input.items) {
    const line = lines[item.lineIndex];
    if (!line) continue;
    askedNow[line.index] = (askedNow[line.index] ?? 0) + item.quantity;
    if (!isRefundItem(item.kind, item.wants)) continue;
    const before = refunded.get(line.index) ?? 0;
    const egp = refundEgpFor(line, item.quantity, before);
    refunded.set(line.index, before + item.quantity);
    refundByLine.set(line.index, (refundByLine.get(line.index) ?? 0) + egp);
    refunds.push({ lineIndex: line.index, quantity: item.quantity });
    itemsEgp += egp;
  }
  const hasRefund = refunds.length > 0;
  const storeFault = input.items.some((item) => isStoreFault(item.kind));
  const shipping = input.order.pricing.shipping;
  const fee = courierFeeEgp({
    orderFeeEgp: shipping?.priceEgp ?? 0,
    normalBoxFeeEgp: input.normalBoxFeeEgp,
    storeFault,
  });
  return {
    money: returnMoney(itemsEgp, fee, hasRefund),
    hasRefund,
    storeFault,
    refundByLine,
    gifts: giftsBack(lines, refunds, leftBefore, askedNow, input.summaries),
  };
}

// ── Live sizes and colours ──────────────────────────────────────────────────

export interface SizeChip {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  /** "M · yours" for the size they have. */
  readonly yours: boolean;
  readonly soldOut: boolean;
  /** "M, the size you have" / "XL, sold out" / "L". */
  readonly ariaLabel: string;
}

function productInStock(product: Product): boolean {
  if (typeof product.stock === 'number') return product.stock > 0;
  return product.inStock;
}

/** The product's sizes; sold-out sizes and the size they have (`current`) are disabled. */
export function sizeChips(product: Product | null, current: string | null): SizeChip[] {
  const option = product?.options.find((entry) => entry.key === 'size');
  if (!product || !option) return [];
  const inStock = productInStock(product);
  return option.values.map((value) => {
    const units = product.stockBySize ? (product.stockBySize[value.id] ?? 0) : null;
    const soldOut = !inStock || (units !== null && units <= 0);
    const yours = value.id === current;
    const ariaLabel = yours
      ? `${value.label}, the size you have`
      : soldOut
        ? `${value.label}, sold out`
        : value.label;
    return { id: value.id, label: value.label, disabled: soldOut || yours, yours, soldOut, ariaLabel };
  });
}

/** The colour's name (`Navy`) from the product's first colour, else the product name. */
export function colourName(product: Product): string {
  const first = product.colors?.[0];
  return COLOR_PALETTE.find((entry) => entry.id === first)?.label ?? product.name;
}

export interface ColourTile {
  readonly productId: string;
  readonly name: string;
  readonly imagePath: string | null;
  readonly imageSrc: string;
  /** Same price as the item they have: can be picked. */
  readonly samePrice: boolean;
}

/** The model's other published colours (the product they have left out). */
export function colourTiles(product: Product | null, siblings: readonly Product[]): ColourTile[] {
  if (!product?.modelGroup) return [];
  return siblings
    .filter((other) => other.id !== product.id && other.published && other.modelGroup === product.modelGroup)
    .map((other) => {
      const imagePath = other.images[0]?.path ?? null;
      return {
        productId: other.id,
        name: colourName(other),
        imagePath,
        imageSrc: imagePath ? normalizeImageKitPath(imagePath) : '',
        samePrice: other.price === product.price,
      };
    });
}

// ── What each request asked for ─────────────────────────────────────────────

/** What one request asked for, as the request box shows it. */
export interface ReturnRequestDetails {
  /** What was asked per item, by line index: `Size M → L`, `Return · Didn't fit`. */
  readonly asked: Readonly<Record<string, string>>;
  readonly storeFault: boolean;
  /** Refund after the courier fee, whole EGP; null when unknown. */
  readonly refundEgp: number | null;
  readonly rejectReason: string | null;
}

/**
 * Extra fields the server may add to an entry of the order's `returns` summary (`askedLabel`
 * per item, `storeFault`, `refundEgp`, `rejectReason`). `readReturnSummaries()` keeps only the
 * fields every entry has, so these are read here; anything missing is null.
 */
export function readRequestDetails(raw: unknown, requestId: string): Partial<ReturnRequestDetails> {
  if (!Array.isArray(raw)) return {};
  const entry: unknown = raw.find((item: unknown) => isRecord(item) && item['id'] === requestId);
  if (!isRecord(entry)) return {};
  const asked: Record<string, string> = {};
  if (Array.isArray(entry['items'])) {
    for (const item of entry['items'] as unknown[]) {
      if (!isRecord(item)) continue;
      const label = item['askedLabel'];
      const lineIndex = item['lineIndex'];
      if (typeof label === 'string' && label.trim() && typeof lineIndex === 'number') {
        asked[String(lineIndex)] ??= label.trim();
      }
    }
  }
  const out: { -readonly [K in keyof ReturnRequestDetails]?: ReturnRequestDetails[K] } = {};
  if (Object.keys(asked).length > 0) out.asked = asked;
  if (typeof entry['storeFault'] === 'boolean') out.storeFault = entry['storeFault'];
  if (typeof entry['refundEgp'] === 'number' && Number.isFinite(entry['refundEgp'])) {
    out.refundEgp = Math.max(0, Math.round(entry['refundEgp']));
  }
  const reason = entry['rejectReason'];
  if (typeof reason === 'string' && reason.trim()) out.rejectReason = reason.trim();
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
