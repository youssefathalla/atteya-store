import * as v from 'valibot';
import { clampLineQuantity, MAX_CART_LINES, type CartLineDraft } from './cart.model';

/**
 * One saved bag line, from browser storage or `carts/{uid}`. Lenient on purpose: a bad
 * quantity becomes 1 and empty choices are dropped, so an old or hand-edited line still loads.
 */
const StoredCartLineSchema = v.object({
  productId: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(128)),
  variantId: v.optional(v.nullable(v.string()), null),
  selection: v.optional(v.record(v.string(), v.unknown()), {}),
  quantity: v.optional(v.number(), 1),
});

/** Turns a saved list into bag lines. Anything that isn't a valid line is skipped, never the whole bag. */
export function parseCartLines(raw: unknown): readonly CartLineDraft[] {
  if (!Array.isArray(raw)) return [];
  const lines: CartLineDraft[] = [];
  for (const entry of raw) {
    if (lines.length >= MAX_CART_LINES) break;
    const parsed = v.safeParse(StoredCartLineSchema, entry);
    if (!parsed.success) continue;
    const selection: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.output.selection)) {
      if (typeof value === 'string' && value.length > 0) selection[key] = value;
    }
    lines.push({
      productId: parsed.output.productId,
      variantId: parsed.output.variantId,
      selection,
      quantity: clampLineQuantity(parsed.output.quantity),
    });
  }
  return lines;
}

/** `carts/{uid}` as stored. Only `lines` is read; `updatedAt` is the server write time. */
export const CartDocSchema = v.object({
  lines: v.optional(v.unknown(), []),
});
