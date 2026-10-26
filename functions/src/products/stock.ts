import { currentProjectId } from '../project-id.js';

export interface StockInput {
  readonly trackStock: unknown;
  readonly variants: unknown;
  /** EasyOrders product-level quantity. `undefined` = not known (e.g. backfill from Firestore). */
  readonly productQuantity?: unknown;
}

/** Legacy availability flag. Kept until PR 1b removes trackStock and variants. */
export function deriveInStock(input: StockInput): boolean | null {
  if (input.trackStock === false) return true;
  if (Array.isArray(input.variants) && input.variants.length > 0) {
    return input.variants.some((variant) => {
      if (typeof variant !== 'object' || variant === null) return false;
      const stock = (variant as { stock?: unknown }).stock;
      return typeof stock === 'number' && Number.isFinite(stock) && stock > 0;
    });
  }
  if (input.productQuantity === undefined) return null;
  const quantity = input.productQuantity;
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
}

export const DEV_PROJECT_ID = 'atteya-store-dev';

/**
 * Dev seeds untracked products at 10. Any other resolved project, including prod
 * `attiya-store`, stays at 0. Throws when the project id cannot be resolved so a
 * missing id cannot silently write 0.
 */
export function untrackedDefaultStock(projectId?: string): number {
  const resolved = (projectId ?? currentProjectId()).trim();
  if (!resolved) {
    throw new Error(
      'Could not resolve the Firebase project id from GCLOUD_PROJECT or FIREBASE_CONFIG. Refusing to default untracked stock to 0.',
    );
  }
  return resolved === DEV_PROJECT_ID ? 10 : 0;
}

export interface StockFields {
  readonly stock: number;
  readonly stockBySize: Readonly<Record<string, number>> | null;
  readonly inStock: boolean;
}

/** Always use this to build the three fields together. stock = sum(map) when a map exists. */
export function stockFields(stockBySize: Record<string, number> | null, flatStock = 0): StockFields {
  if (stockBySize) {
    const map: Record<string, number> = {};
    let sum = 0;
    for (const [id, raw] of Object.entries(stockBySize)) {
      const count = wholeCount(raw);
      map[id] = count;
      sum += count;
    }
    return { stock: sum, stockBySize: map, inStock: sum > 0 };
  }
  const stock = wholeCount(flatStock);
  return { stock, stockBySize: null, inStock: stock > 0 };
}

export interface BootstrapInput {
  readonly trackStock: unknown;
  readonly variants: unknown;
  /** Stored options array; the size map is keyed by the option whose key is `size`. */
  readonly options: unknown;
  /** EasyOrders product-level quantity. `undefined` = unknown (migration). */
  readonly productQuantity?: unknown;
  readonly untrackedDefault: number;
}

/** Initial stock per the bootstrap rule. null = needs the import (tracked, no variants, quantity unknown). */
export function bootstrapStock(input: BootstrapInput): StockFields | null {
  const sizeIds = readSizeValueIds(input.options);
  if (input.trackStock === false) {
    if (sizeIds.length > 0) {
      const map: Record<string, number> = {};
      const each = wholeCount(input.untrackedDefault);
      for (const id of sizeIds) map[id] = each;
      return stockFields(map);
    }
    return stockFields(null, input.untrackedDefault);
  }

  if (Array.isArray(input.variants) && input.variants.length > 0) {
    if (sizeIds.length > 0) {
      const map: Record<string, number> = {};
      for (const id of sizeIds) map[id] = 0;
      for (const variant of input.variants) {
        if (typeof variant !== 'object' || variant === null) continue;
        const values = (variant as { values?: unknown }).values;
        if (typeof values !== 'object' || values === null) continue;
        const sizeId = (values as { size?: unknown }).size;
        if (typeof sizeId !== 'string' || !Object.hasOwn(map, sizeId)) continue;
        map[sizeId] += wholeCount((variant as { stock?: unknown }).stock);
      }
      return stockFields(map);
    }
    let total = 0;
    for (const variant of input.variants) {
      if (typeof variant !== 'object' || variant === null) continue;
      total += wholeCount((variant as { stock?: unknown }).stock);
    }
    return stockFields(null, total);
  }

  if (input.productQuantity === undefined) return null;
  return stockFields(null, wholeCount(input.productQuantity));
}

function wholeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Value ids of the first `size` option. Empty when the product has no sizes. */
function readSizeValueIds(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  for (const option of options) {
    if (typeof option !== 'object' || option === null) continue;
    if ((option as { key?: unknown }).key !== 'size') continue;
    const values = (option as { values?: unknown }).values;
    if (!Array.isArray(values)) return [];
    const ids: string[] = [];
    for (const value of values) {
      if (typeof value !== 'object' || value === null) continue;
      const id = (value as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length === 0 || ids.includes(id)) continue;
      ids.push(id);
    }
    return ids;
  }
  return [];
}
