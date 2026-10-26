import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { readSizeValueIds, stockFields, type StockFields } from './stock.js';

const MAX_COUNT = 100_000; // sanity cap per entry
const MAX_SIZES = 20; // matches validStock in the rules

interface SetProductStockRequest {
  readonly productId: string;
  readonly stockBySize?: Readonly<Record<string, number>>; // only the sizes that changed
  readonly stock?: number; // products without a size option
}

export interface SetProductStockResponse {
  readonly stock: number;
  readonly stockBySize: Readonly<Record<string, number>> | null;
  readonly inStock: boolean;
}

export const setProductStock = onCall(
  adminCallableOptions(),
  async (request): Promise<SetProductStockResponse> => {
    const actor = await requireRole(request, 'admin');
    const input = parseSetProductStockRequest(request.data);
    const db = getFirestore();
    const ref = db.collection('products').doc(input.productId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); // live doc, read first
      if (!snap.exists) {
        throw new HttpsError('not-found', 'This product no longer exists. Reload the page.');
      }
      const data = snap.data() ?? {};
      const sizeIds = readSizeValueIds(data['options']);
      const next = nextStock(sizeIds, data['stockBySize'], input);
      // No auditLogs entry: a stock change log comes later.
      tx.update(ref, {
        stock: next.stock,
        inStock: next.inStock,
        stockBySize: next.stockBySize ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return next;
    });
  },
);

function parseSetProductStockRequest(raw: unknown): SetProductStockRequest {
  if (!isPlainObject(raw)) {
    throw new HttpsError('invalid-argument', 'Send a product and its stock.');
  }
  const productId = raw['productId'];
  if (
    typeof productId !== 'string' ||
    productId.length === 0 ||
    productId.length > 200 ||
    productId.includes('/')
  ) {
    throw new HttpsError('invalid-argument', 'Choose a product and try again.');
  }

  const hasMap = raw['stockBySize'] !== undefined;
  const hasStock = raw['stock'] !== undefined;
  if (hasMap === hasStock) {
    throw new HttpsError(
      'invalid-argument',
      hasMap
        ? 'Send either one stock number or stock per size, not both.'
        : 'Send a stock number or stock per size.',
    );
  }

  if (hasStock) {
    if (!isAllowedCount(raw['stock'])) {
      throw new HttpsError('invalid-argument', 'Stock must be a whole number of 0 or more.');
    }
    return { productId, stock: raw['stock'] };
  }

  return { productId, stockBySize: parseStockBySize(raw['stockBySize']) };
}

function nextStock(
  sizeIds: readonly string[],
  liveMap: unknown,
  input: SetProductStockRequest,
): StockFields {
  if (sizeIds.length > 0) {
    const sent = input.stockBySize;
    if (sent === undefined) {
      throw new HttpsError('failed-precondition', 'This product has sizes. Enter stock per size.');
    }
    for (const id of Object.keys(sent)) {
      if (!sizeIds.includes(id)) {
        throw new HttpsError(
          'invalid-argument',
          "One of the sizes isn't on this product any more. Reload the page.",
        );
      }
    }
    const live = isPlainObject(liveMap) ? liveMap : {};
    const merged = Object.fromEntries(
      sizeIds.map((id) => [id, sent[id] ?? (typeof live[id] === 'number' ? live[id] : 0)]),
    );
    return stockFields(merged);
  }

  if (input.stockBySize !== undefined) {
    throw new HttpsError(
      'failed-precondition',
      'This product has no sizes. Enter one stock number.',
    );
  }
  if (input.stock === undefined) {
    throw new HttpsError('invalid-argument', 'Stock must be a whole number of 0 or more.');
  }
  return stockFields(null, input.stock);
}

function parseStockBySize(raw: unknown): Readonly<Record<string, number>> {
  if (!isPlainObject(raw)) {
    throw new HttpsError('invalid-argument', 'Enter stock for each size as a whole number.');
  }
  const keys = Object.keys(raw);
  if (keys.length === 0) {
    throw new HttpsError('invalid-argument', 'Enter stock for at least one size.');
  }
  if (keys.length > MAX_SIZES) {
    throw new HttpsError('invalid-argument', 'Enter stock for at most 20 sizes.');
  }
  const entries: [string, number][] = [];
  for (const key of keys) {
    const value = raw[key];
    if (!isAllowedCount(value)) {
      throw new HttpsError('invalid-argument', 'Stock must be a whole number of 0 or more.');
    }
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function isAllowedCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
