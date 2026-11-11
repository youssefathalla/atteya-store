import * as v from 'valibot';
import {
  clampLineQuantity,
  MAX_CART_LINES,
  MAX_LINE_GIFTS,
  type CartLineDraft,
  type CartLineGift,
} from './cart.model';

const shortId = v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(128));

const StoredCartGiftSchema = v.object({
  offerId: shortId,
  giftId: shortId,
  productId: shortId,
  sizeId: v.optional(v.nullable(shortId), null),
});

/**
 * One saved bag line, from browser storage or `carts/{uid}`. Lenient on purpose: a bad
 * quantity becomes 1 and empty choices are dropped, so an old or hand-edited line still loads.
 */
const StoredCartLineSchema = v.object({
  productId: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(128)),
  variantId: v.optional(v.nullable(v.string()), null),
  selection: v.optional(v.record(v.string(), v.unknown()), {}),
  quantity: v.optional(v.number(), 1),
  gifts: v.optional(v.array(v.unknown()), []),
});

/** Gift picks of a saved line. Bad picks are dropped; picks from a second offer are dropped too. */
function parseGifts(raw: readonly unknown[]): CartLineGift[] {
  const gifts: CartLineGift[] = [];
  for (const entry of raw) {
    if (gifts.length >= MAX_LINE_GIFTS) break;
    const parsed = v.safeParse(StoredCartGiftSchema, entry);
    if (!parsed.success) continue;
    if (gifts.length > 0 && gifts[0].offerId !== parsed.output.offerId) continue;
    gifts.push(parsed.output);
  }
  return gifts;
}

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
      ...giftsField(parseGifts(parsed.output.gifts)),
    });
  }
  return lines;
}

function giftsField(gifts: readonly CartLineGift[]): Pick<CartLineDraft, 'gifts'> {
  return gifts.length > 0 ? { gifts } : {};
}

/** `carts/{uid}` as stored. Only `lines` is read; `updatedAt` is the server write time. */
export const CartDocSchema = v.object({
  lines: v.optional(v.unknown(), []),
});
