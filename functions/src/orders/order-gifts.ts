import type { DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  checkGiftPicks,
  giftOfferById,
  type GiftChoiceFacts,
  type Offer,
  type OfferGift,
  type PricingContext,
  type ProductFacts,
  type VariantFacts,
} from '../offers/engine/index.js';
import type { OrderGiftPickInput } from './order-request.js';

/** A gift pick the server accepted, ready to become a price-0 order line. */
export interface ResolvedGift {
  readonly offerId: string;
  readonly gift: OfferGift;
  readonly productId: string;
  /** The gift product's options as saved on the order line (size, plus any single-value option). */
  readonly selection: Readonly<Record<string, string>>;
  readonly data: DocumentData;
}

const GIFT_ENDED = 'The free gift offer on one item in your bag has ended. Remove the item and add it again.';
const GIFT_GONE = 'One free gift in your bag is no longer available. Remove the item and choose another gift.';
const GIFT_INVALID = 'The free gifts in your bag could not be read. Choose them again.';

/**
 * Re-checks the gifts a bag line asks for: the offer is live, the bought product (and variant)
 * qualifies, every pick is a gift of that offer and a product it allows, and that product is
 * published and has `quantity` pieces in stock in the chosen size. One set of gifts per piece.
 * Throws a shopper-facing `HttpsError` when anything is off.
 */
export function resolveLineGifts(args: {
  readonly picks: readonly OrderGiftPickInput[];
  readonly quantity: number;
  readonly product: ProductFacts;
  readonly variant: VariantFacts | null;
  readonly offers: readonly Offer[];
  readonly ctx: PricingContext;
  /** Live gift product docs by id (`undefined` = missing). */
  readonly giftDocs: ReadonlyMap<string, DocumentData | undefined>;
}): ResolvedGift[] {
  const { picks, quantity } = args;
  if (picks.length === 0) return [];
  const offerId = picks[0]!.offerId;

  const choices: GiftChoiceFacts[] = [];
  for (const [productId, data] of args.giftDocs) {
    choices.push({
      productId,
      published: data?.['published'] === true,
      inStock: data?.['inStock'] === true,
    });
  }

  const giftOffer = giftOfferById(offerId, args.product, args.variant, args.offers, args.ctx, choices);
  if (!giftOffer) {
    throw new HttpsError('failed-precondition', GIFT_ENDED);
  }

  const check = checkGiftPicks(
    giftOffer,
    picks.map((pick) => ({ giftId: pick.giftId, productId: pick.productId })),
  );
  if (!check.ok) {
    throw new HttpsError('failed-precondition', check.problem === 'duplicate-gift' ? GIFT_INVALID : GIFT_GONE);
  }

  const resolved: ResolvedGift[] = [];
  for (const { gift, productId } of check.picks) {
    const pick = picks.find((entry) => entry.giftId === gift.id)!;
    const data = args.giftDocs.get(productId);
    if (!data) throw new HttpsError('failed-precondition', GIFT_GONE);
    const selection = giftSelection(data, pick.sizeId);
    assertGiftStock(data, selection, quantity);
    resolved.push({ offerId, gift, productId, selection, data });
  }
  return resolved;
}

/**
 * The options saved for a gift product: the picked size when it has sizes, and the only value of
 * any other option. A gift product with a real choice besides size can't be given.
 */
export function giftSelection(data: DocumentData, sizeId: string | null): Record<string, string> {
  const selection: Record<string, string> = {};
  const options = data['options'];
  if (!Array.isArray(options)) return selection;
  for (const option of options) {
    if (!option || typeof option['key'] !== 'string') continue;
    const values: unknown[] = Array.isArray(option['values']) ? option['values'] : [];
    const ids = values
      .map((val) => (val && typeof (val as { id?: unknown }).id === 'string' ? (val as { id: string }).id : null))
      .filter((id): id is string => id !== null);
    if (ids.length === 0) continue;
    if (option['key'] === 'size') {
      if (!sizeId || !ids.includes(sizeId)) {
        throw new HttpsError('invalid-argument', 'Choose a size for each free gift in your bag.');
      }
      selection['size'] = sizeId;
    } else if (ids.length === 1) {
      selection[option['key']] = ids[0]!;
    } else {
      throw new HttpsError('failed-precondition', GIFT_GONE);
    }
  }
  return selection;
}

function assertGiftStock(data: DocumentData, selection: Readonly<Record<string, string>>, quantity: number): void {
  if (data['inStock'] !== true) throw new HttpsError('failed-precondition', GIFT_GONE);
  const stockBySize = data['stockBySize'];
  if (typeof stockBySize === 'object' && stockBySize !== null && !Array.isArray(stockBySize)) {
    const sizeId = selection['size'];
    const available = sizeId ? (stockBySize as Record<string, unknown>)[sizeId] : undefined;
    if (typeof available !== 'number' || available < quantity) {
      throw new HttpsError('failed-precondition', GIFT_GONE);
    }
    return;
  }
  if (typeof data['stock'] === 'number' && data['stock'] < quantity) {
    throw new HttpsError('failed-precondition', GIFT_GONE);
  }
}

/** Every gift product id the bag asks for, to read them in one go. */
export function giftProductIds(lines: readonly { readonly gifts: readonly OrderGiftPickInput[] }[]): string[] {
  const ids = new Set<string>();
  for (const line of lines) {
    for (const pick of line.gifts) ids.add(pick.productId);
  }
  return Array.from(ids);
}
