import { giftOfferById, liveOffers, type Offer, type PricingContext } from '@core/services/offers/engine';
import { bagGiftKey, type BagGiftState, type BagOfferState } from './bag-offer-notes';
import { bagLineVariant, type BagPricingProduct, type PricedBagLine } from './cart-deals';
import { giftNameFor } from './cart-gifts';
import { cartLineKey, type CartLineDraft } from './cart.model';

/** What the notes need to know about one bag product: its pricing plus its stock. */
export interface BagNotesProduct extends BagPricingProduct {
  /** Whole-product count when tracked, else null (then `inStock` decides). */
  readonly stock: number | null;
  readonly inStock: boolean;
  /** Count per size id when the product keeps stock by size, else null. */
  readonly stockBySize: Readonly<Record<string, number>> | null;
}

/** One look at the bag for the notes, plus which offers are live right now. */
export interface BagOfferLook {
  readonly state: BagOfferState;
  readonly liveIds: ReadonlySet<string>;
}

/**
 * What the bag gets from offers right now (`BagOfferState`), or null while anything it depends on
 * is still loading (a line's product or a gift product not read yet), so a load never reads as a
 * change. `products`: `null` = gone, missing = not loaded. `extraOfferIds` adds offers checkout
 * applies outside the items (the Free shipping offer that made shipping free).
 */
export function bagOfferLook(args: {
  readonly bagKey: string;
  readonly lines: readonly CartLineDraft[];
  readonly products: ReadonlyMap<string, BagNotesProduct | null | undefined>;
  readonly priced: readonly (PricedBagLine | null)[];
  readonly offers: readonly Offer[];
  readonly ctx: PricingContext;
  readonly extraOfferIds?: readonly string[];
}): BagOfferLook | null {
  const { lines, products, priced, offers, ctx } = args;
  for (const line of lines) {
    if (products.get(line.productId) === undefined) return null;
    for (const gift of line.gifts ?? []) if (products.get(gift.productId) === undefined) return null;
  }

  const titleOf = (offerId: string): string => offers.find((offer) => offer.id === offerId)?.title ?? '';
  const offerTitles = new Map<string, string>();
  const add = (offerId: string): void => {
    if (!offerTitles.has(offerId)) offerTitles.set(offerId, titleOf(offerId));
  };
  priced.forEach((line) => {
    if (!line) return;
    // One discount per item: the per-item offer counts only when some pieces still get it.
    if (line.appliedOfferId && line.deals.offerUnits > 0) add(line.appliedOfferId);
    for (const deal of line.deals.deals) add(deal.offerId);
  });
  for (const offerId of args.extraOfferIds ?? []) add(offerId);

  const gifts = new Map<string, BagGiftState>();
  lines.forEach((line, index) => {
    const picks = line.gifts ?? [];
    const product = products.get(line.productId);
    if (picks.length === 0 || !product) return;
    // A piece with a Buy X Get Y discount comes without its free gifts: none are given here.
    const pricedLine = priced[index];
    if (pricedLine && pricedLine.deals.giftUnits <= 0) return;
    const lineKey = cartLineKey(line);
    const choices = picks.map((pick) => {
      const info = products.get(pick.productId);
      return { productId: pick.productId, published: Boolean(info), inStock: giftInStock(info, pick.sizeId) };
    });
    const offerId = picks[0]!.offerId;
    const variant = bagLineVariant(product, line);
    // The same checks as the order callables: offer live for this item, the pick still one of its
    // choices, and the gift product published with stock in the chosen size.
    const giftOffer = giftOfferById(offerId, product.priced, variant, offers, ctx, choices);
    for (const pick of picks) {
      const allowed = giftOffer?.gifts.some(
        (gift) => gift.id === pick.giftId && gift.productIds.includes(pick.productId),
      );
      if (!allowed || pick.offerId !== offerId) continue;
      gifts.set(bagGiftKey(lineKey, pick.offerId, pick.giftId), {
        lineKey,
        name: giftNameFor(offers, pick.offerId, pick.giftId),
      });
    }
  });

  return {
    state: { bagKey: args.bagKey, offers: offerTitles, gifts },
    liveIds: new Set(liveOffers(offers, ctx).map((offer) => offer.id)),
  };
}

function giftInStock(info: BagNotesProduct | null | undefined, sizeId: string | null | undefined): boolean {
  if (!info) return false;
  const inStock = typeof info.stock === 'number' ? info.stock > 0 : info.inStock;
  if (!inStock) return false;
  if (info.stockBySize && sizeId) return (info.stockBySize[sizeId] ?? 0) > 0;
  return true;
}
