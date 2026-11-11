/** What the product page hands to the future CartService. Prices are NOT included: checkout re-prices from Firestore. */
export interface CartLineDraft {
  readonly productId: string;
  readonly variantId: string | null;
  readonly selection: Readonly<Record<string, string>>;
  readonly quantity: number;
  /**
   * Free gifts the shopper chose on the product page (one set per piece). Missing or empty = no
   * gifts. Checkout re-checks them on the server and adds them as price-0 order lines.
   */
  readonly gifts?: readonly CartLineGift[];
}

/** One free gift picked for a bag line: the offer and gift, the product chosen, and its size. */
export interface CartLineGift {
  readonly offerId: string;
  readonly giftId: string;
  readonly productId: string;
  /** Size value id when the gift product has sizes, else null. */
  readonly sizeId: string | null;
}

/** Most gift picks on one bag line. Matches `carts/{uid}` rules and the order callables. */
export const MAX_LINE_GIFTS = 5;

/**
 * Stable identity of a bag line: the same product with the same options and the same gifts is
 * one line. Different gift choices stay separate lines.
 */
export function cartLineKey(line: CartLineDraft): string {
  const base = `${line.productId}:${line.variantId ?? ''}:${stableSelection(line.selection)}`;
  const gifts = line.gifts ?? [];
  return gifts.length === 0 ? base : `${base}:${stableGifts(gifts)}`;
}

function stableGifts(gifts: readonly CartLineGift[]): string {
  return gifts
    .map((gift) => `${gift.offerId}/${gift.giftId}=${gift.productId}/${gift.sizeId ?? ''}`)
    .sort()
    .join('|');
}

function stableSelection(selection: Readonly<Record<string, string>>): string {
  return Object.keys(selection)
    .sort()
    .map((key) => `${key}=${selection[key]}`)
    .join('|');
}

/** Most pieces of one line (same product, same choices). Matches `carts/{uid}` rules and the order callables. */
export const MAX_LINE_QUANTITY = 20;

/** Most lines in one bag. Matches `carts/{uid}` rules and the order callables (`MAX_LINES` in `order-request.ts`). */
export const MAX_CART_LINES = 20;

/** Clamp to a whole number between 1 and `MAX_LINE_QUANTITY`. */
export function clampLineQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

/**
 * Adds `line` to `lines`: the same product with the same choices adds to that line's
 * quantity (capped at `MAX_LINE_QUANTITY`), anything else becomes a new line at the end.
 * A new line past `MAX_CART_LINES` is dropped.
 */
export function addCartLine(lines: readonly CartLineDraft[], line: CartLineDraft): readonly CartLineDraft[] {
  const key = cartLineKey(line);
  const index = lines.findIndex((entry) => cartLineKey(entry) === key);
  if (index >= 0) {
    const next = [...lines];
    next[index] = {
      ...next[index],
      quantity: clampLineQuantity(next[index].quantity + line.quantity),
    };
    return next;
  }
  if (lines.length >= MAX_CART_LINES) return lines;
  return [...lines, { ...line, quantity: clampLineQuantity(line.quantity) }];
}

/** Adds every line of `extra` to `base` with `addCartLine` (guest bag into the account bag on sign-in). */
export function mergeCartLines(
  base: readonly CartLineDraft[],
  extra: readonly CartLineDraft[],
): readonly CartLineDraft[] {
  return extra.reduce<readonly CartLineDraft[]>((lines, line) => addCartLine(lines, line), base);
}
