import { HttpsError } from 'firebase-functions/v2/https';
import { readSizeValueIds, stockFields, type StockFields } from '../products/stock.js';

export interface OrderLineForStock {
  readonly productId: string;
  readonly quantity: number;
  readonly selection: Readonly<Record<string, string>>;
}

export interface ProductStockSnapshot {
  readonly stock: unknown;
  readonly stockBySize: unknown;
  readonly options: unknown;
}

/** Per-product demand: either flat quantity or per-size quantities (never both). */
export type ProductStockDemand =
  | { readonly kind: 'flat'; readonly quantity: number }
  | { readonly kind: 'sized'; readonly bySize: Readonly<Record<string, number>> };

/**
 * Collapse order lines into one demand entry per product id.
 * Sized and flat lines for the same product cannot be mixed.
 */
export function aggregateOrderStockDemand(
  lines: readonly OrderLineForStock[],
): ReadonlyMap<string, ProductStockDemand> {
  const acc = new Map<
    string,
    { flat: number; bySize: Map<string, number> }
  >();

  for (const line of lines) {
    if (!line.productId || !Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new HttpsError('invalid-argument', 'This order has an invalid item quantity.');
    }
    const entry = acc.get(line.productId) ?? { flat: 0, bySize: new Map<string, number>() };
    const sizeId = line.selection['size'];
    if (typeof sizeId === 'string' && sizeId.length > 0) {
      entry.bySize.set(sizeId, (entry.bySize.get(sizeId) ?? 0) + line.quantity);
    } else {
      entry.flat += line.quantity;
    }
    acc.set(line.productId, entry);
  }

  const out = new Map<string, ProductStockDemand>();
  for (const [productId, entry] of acc) {
    const hasSized = entry.bySize.size > 0;
    const hasFlat = entry.flat > 0;
    if (hasSized && hasFlat) {
      throw new HttpsError(
        'failed-precondition',
        'This order mixes sized and unsized lines for the same product.',
      );
    }
    if (hasSized) {
      out.set(productId, {
        kind: 'sized',
        bySize: Object.fromEntries(entry.bySize),
      });
    } else {
      out.set(productId, { kind: 'flat', quantity: entry.flat });
    }
  }
  return out;
}

/**
 * Compute the next stock fields after removing demand from a live product doc.
 * Matches checkout `assertLineStock`: use `stockBySize` only when that map exists;
 * otherwise decrement flat `stock` (including sized option products that only store
 * a product-level quantity after EasyOrders import).
 * Does not write — callers apply the result inside a transaction.
 */
export function nextStockAfterDemand(
  product: ProductStockSnapshot,
  demand: ProductStockDemand,
): StockFields {
  return applyStockDemand(product, demand, { allowShortfall: false }).next;
}

export interface StockDemandResult {
  readonly next: StockFields;
  /** True when demand exceeded live stock and counts were floored at 0 (only with `allowShortfall`). */
  readonly short: boolean;
}

/**
 * Same as `nextStockAfterDemand`, but with `allowShortfall: true` a count that is too low
 * is floored at 0 and reported as `short` instead of throwing. Used when money has already
 * been taken (Paymob webhook) and the order must still be confirmed and flagged for review.
 * A missing size, a size no longer on the product, or unset stock still throws.
 */
export function applyStockDemand(
  product: ProductStockSnapshot,
  demand: ProductStockDemand,
  opts: { readonly allowShortfall: boolean },
): StockDemandResult {
  let short = false;
  const sizeIds = readSizeValueIds(product.options);
  const liveMap = isPlainObject(product.stockBySize) ? product.stockBySize : null;

  // Same gate as assertLineStock: only the map path when the map is present.
  if (liveMap !== null) {
    if (demand.kind !== 'sized') {
      throw new HttpsError(
        'failed-precondition',
        'This order is missing a size for a product that has sizes.',
      );
    }
    const hasSizeOption = sizeIds.length > 0;
    const knownIds = hasSizeOption ? sizeIds : Object.keys(liveMap);
    const nextMap: Record<string, number> = {};
    for (const id of knownIds) {
      const raw = liveMap[id];
      nextMap[id] =
        typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    }
    for (const [sizeId, qty] of Object.entries(demand.bySize)) {
      if (!Object.hasOwn(nextMap, sizeId) && hasSizeOption) {
        throw new HttpsError(
          'failed-precondition',
          "One ordered size is no longer on the product. Update the order or the product's sizes.",
        );
      }
      if (!Object.hasOwn(nextMap, sizeId)) {
        nextMap[sizeId] = 0;
      }
      if (nextMap[sizeId]! < qty) {
        if (!opts.allowShortfall) {
          throw new HttpsError(
            'failed-precondition',
            'Not enough stock left for one of the ordered sizes.',
          );
        }
        short = true;
        nextMap[sizeId] = 0;
        continue;
      }
      nextMap[sizeId]! -= qty;
    }
    return { next: stockFields(nextMap), short };
  }

  const qty = demandQuantity(demand);
  if (typeof product.stock !== 'number' || !Number.isFinite(product.stock)) {
    throw new HttpsError(
      'failed-precondition',
      'Stock is not set up for one of the products on this order.',
    );
  }
  const live = Math.max(0, Math.floor(product.stock));
  if (live < qty) {
    if (!opts.allowShortfall) {
      throw new HttpsError(
        'failed-precondition',
        'Not enough stock left for one of the ordered items.',
      );
    }
    return { next: stockFields(null, 0), short: true };
  }
  return { next: stockFields(null, live - qty), short };
}

/** Read `pricing.lines` from a stored order into stock lines (COD confirm and Paymob webhook). */
export function parseOrderStockLines(order: Readonly<Record<string, unknown>>): OrderLineForStock[] {
  const pricing = isPlainObject(order['pricing']) ? order['pricing'] : null;
  const rawLines = pricing && Array.isArray(pricing['lines']) ? pricing['lines'] : null;
  if (!rawLines || rawLines.length === 0) {
    throw new HttpsError('failed-precondition', 'This order has no items to confirm.');
  }
  const lines: OrderLineForStock[] = [];
  for (const entry of rawLines) {
    if (!isPlainObject(entry)) {
      throw new HttpsError('failed-precondition', 'This order has an invalid item.');
    }
    const productId = entry['productId'];
    const quantity = entry['quantity'];
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new HttpsError('failed-precondition', 'This order has an invalid item.');
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      throw new HttpsError('failed-precondition', 'This order has an invalid item quantity.');
    }
    const selectionRaw = entry['selection'];
    const selection: Record<string, string> = {};
    if (isPlainObject(selectionRaw)) {
      for (const [key, value] of Object.entries(selectionRaw)) {
        if (typeof value === 'string') selection[key] = value;
      }
    }
    lines.push({ productId, quantity, selection });
  }
  return lines;
}

function demandQuantity(demand: ProductStockDemand): number {
  if (demand.kind === 'flat') return demand.quantity;
  let total = 0;
  for (const qty of Object.values(demand.bySize)) total += qty;
  return total;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
