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

  // Pieces the order takes from stock, by `giftStockKey`, counted like the order callables do:
  // every paid line first, then each line's gifts in bag order.
  const demand = new Map<string, number>();
  for (const line of lines) {
    const info = products.get(line.productId);
    if (!info) continue;
    const key = giftStockKey(line.productId, info, line.selection['size']);
    demand.set(key, (demand.get(key) ?? 0) + line.quantity);
  }

  const gifts = new Map<string, BagGiftState>();
  lines.forEach((line, index) => {
    const picks = line.gifts ?? [];
    const product = products.get(line.productId);
    if (picks.length === 0 || !product) return;
    // A piece with a Buy X Get Y discount comes without its free gifts. When every piece has one,
    // no gifts are given right now, but they are not lost either: they are still checked (for one
    // set) so a deal winning over them never reads as the gift being no longer available.
    const pricedLine = priced[index];
    const units = pricedLine ? pricedLine.deals.giftUnits : line.quantity;
    const wanted = Math.max(units, 1);
    const lineKey = cartLineKey(line);
    const added = new Map<string, number>();
    const pickInStock = picks.map((pick) => {
      const info = products.get(pick.productId);
      if (!info) return false;
      const key = giftStockKey(pick.productId, info, pick.sizeId);
      const taken = (added.get(key) ?? 0) + wanted;
      added.set(key, taken);
      return giftInStock(info, pick.sizeId, (demand.get(key) ?? 0) + taken);
    });
    const choices = picks.map((pick, i) => ({
      productId: pick.productId,
      published: Boolean(products.get(pick.productId)),
      inStock: pickInStock[i]!,
    }));
    const offerId = picks[0]!.offerId;
    const variant = bagLineVariant(product, line);
    // The same checks as the order callables: offer live for this item, the pick still one of its
    // choices, and the gift product published with enough stock in the chosen size for this
    // line's gifts on top of everything else the bag takes from it.
    const giftOffer = giftOfferById(offerId, product.priced, variant, offers, ctx, choices);
    // Only gifts that are really given take stock, as in the order callables: a pick that is sold
    // out or no longer allowed must not make a later line's gift look sold out.
    const given = new Map<string, number>();
    picks.forEach((pick, i) => {
      const allowed = giftOffer?.gifts.some(
        (gift) => gift.id === pick.giftId && gift.productIds.includes(pick.productId),
      );
      if (!allowed || !pickInStock[i] || pick.offerId !== offerId) return;
      gifts.set(bagGiftKey(lineKey, pick.offerId, pick.giftId), {
        lineKey,
        name: giftNameFor(offers, pick.offerId, pick.giftId),
      });
      const info = products.get(pick.productId);
      if (!info) return;
      const key = giftStockKey(pick.productId, info, pick.sizeId);
      given.set(key, (given.get(key) ?? 0) + wanted);
    });
    if (units > 0) {
      for (const [key, taken] of given) demand.set(key, (demand.get(key) ?? 0) + taken);
    }
  });

  return {
    state: { bagKey: args.bagKey, offers: offerTitles, gifts },
    liveIds: new Set(liveOffers(offers, ctx).map((offer) => offer.id)),
  };
}

/** Which stock count a piece comes out of (as `stockDemandKey` in the order callables). */
function giftStockKey(productId: string, info: BagNotesProduct, sizeId: string | null | undefined): string {
  return info.stockBySize ? `${productId}\u0000size\u0000${sizeId ?? ''}` : `${productId}\u0000all`;
}

/** Whether the product has `needed` pieces in stock (in `sizeId` when it keeps stock by size). */
function giftInStock(
  info: BagNotesProduct | null | undefined,
  sizeId: string | null | undefined,
  needed: number,
): boolean {
  if (!info) return false;
  const inStock = typeof info.stock === 'number' ? info.stock >= needed : info.inStock;
  if (!inStock) return false;
  if (info.stockBySize && sizeId) return (info.stockBySize[sizeId] ?? 0) >= needed;
  return true;
}
