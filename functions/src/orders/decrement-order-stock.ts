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
 * Does not write — callers apply the result inside a transaction.
 */
export function nextStockAfterDemand(
  product: ProductStockSnapshot,
  demand: ProductStockDemand,
): StockFields {
  const sizeIds = readSizeValueIds(product.options);
  const liveMap = isPlainObject(product.stockBySize) ? product.stockBySize : null;
  const hasSizeOption = sizeIds.length > 0;
  const hasLiveMap = liveMap !== null;

  if (hasSizeOption || hasLiveMap) {
    if (demand.kind !== 'sized') {
      throw new HttpsError(
        'failed-precondition',
        'This order is missing a size for a product that has sizes.',
      );
    }
    const knownIds = hasSizeOption ? sizeIds : Object.keys(liveMap!);
    const nextMap: Record<string, number> = {};
    for (const id of knownIds) {
      const live =
        liveMap && typeof liveMap[id] === 'number' && Number.isFinite(liveMap[id])
          ? Math.max(0, Math.floor(liveMap[id] as number))
          : 0;
      nextMap[id] = live;
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
        throw new HttpsError(
          'failed-precondition',
          'Not enough stock left for one of the ordered sizes.',
        );
      }
      nextMap[sizeId]! -= qty;
    }
    return stockFields(nextMap);
  }

  if (demand.kind !== 'flat') {
    throw new HttpsError(
      'failed-precondition',
      'This order has a size for a product that no longer has sizes.',
    );
  }
  if (typeof product.stock !== 'number' || !Number.isFinite(product.stock)) {
    throw new HttpsError(
      'failed-precondition',
      'Stock is not set up for one of the products on this order.',
    );
  }
  const live = Math.max(0, Math.floor(product.stock));
  if (live < demand.quantity) {
    throw new HttpsError('failed-precondition', 'Not enough stock left for one of the ordered items.');
  }
  return stockFields(null, live - demand.quantity);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
