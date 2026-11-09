import type { Offer } from '@core/services/offers/engine';
import { COLOR_PALETTE } from '@core/services/products/catalog-taxonomy';
import type { Product } from '@core/services/products/product.model';

/** Gift name shown when the offer that gave the gift has ended or can't be read. */
export const FALLBACK_GIFT_NAME = 'Free gift';

/**
 * How a gift product is named to shoppers: its name plus its one colour ("Adidas Simple Polo
 * White"), because product names carry no colour and two gift choices are often the same model.
 * A product with no colour, several colours, or a name that already ends with the colour keeps
 * its name.
 */
export function giftProductLabel(product: { readonly name: string; readonly colors?: readonly string[] }): string {
  const name = product.name.trim();
  const colors = product.colors ?? [];
  if (colors.length !== 1 || colors[0] === 'multi') return name;
  const colour = COLOR_PALETTE.find((entry) => entry.id === colors[0])?.label;
  if (!colour || name.toLowerCase().endsWith(colour.toLowerCase())) return name;
  return `${name} ${colour}`;
}

/** One gift under its item in the bag and checkout: "Free shirt: Adidas Simple Polo White, L". */
export function giftLineLabel(giftName: string, productLabel: string, sizeLabel: string | null): string {
  return sizeLabel ? `${giftName}: ${productLabel}, ${sizeLabel}` : `${giftName}: ${productLabel}`;
}

/** The gift's name from its offer ("Free shirt"), or "Free gift" when the offer is gone. */
export function giftNameFor(offers: readonly Offer[], offerId: string, giftId: string): string {
  const offer = offers.find((entry) => entry.id === offerId);
  if (!offer || offer.reward.kind !== 'freeGift') return FALLBACK_GIFT_NAME;
  return offer.reward.gifts.find((gift) => gift.id === giftId)?.name.trim() || FALLBACK_GIFT_NAME;
}

/** One size of a gift product. Only sizes with stock are listed. */
export interface GiftSizeView {
  readonly id: string;
  readonly label: string;
}

/** One product the shopper can take as a gift. `sizes` is null when it has no sizes. */
export interface GiftChoiceView {
  readonly productId: string;
  /** Full name plus colour. Used for the card's `aria-label` and the chosen name. */
  readonly label: string;
  /** The product's own name and colours, the input of the short card line. */
  readonly name: string;
  readonly colors: readonly string[];
  /** The one short line under the card's photo. Set per gift by `buildGiftBox`. */
  readonly cardLabel: string;
  /** Main photo path (empty when the product has none yet). Shown on the choice's tile. */
  readonly imagePath: string;
  readonly sizes: readonly GiftSizeView[] | null;
}

/**
 * A product the shopper can take for free (a Free gift, or the free item of a Buy X Get Y
 * offer in the bag), or null when it can't be given now: out of stock,
 * every size sold out, or a choice besides size with more than one value (checkout refuses those).
 */
export function toGiftChoice(product: Product): GiftChoiceView | null {
  if (!product.published) return null;
  if (typeof product.stock === 'number' ? product.stock <= 0 : !product.inStock) return null;
  let sizes: GiftSizeView[] | null = null;
  for (const option of product.options) {
    if (option.values.length === 0) continue;
    if (option.key === 'size') {
      sizes = option.values
        .filter((value) => !product.stockBySize || (product.stockBySize[value.id] ?? 0) > 0)
        .map((value) => ({ id: value.id, label: value.label }));
      if (sizes.length === 0) return null;
    } else if (option.values.length > 1) {
      return null;
    }
  }
  return {
    productId: product.id,
    label: giftProductLabel(product),
    name: product.name,
    colors: product.colors,
    cardLabel: product.name,
    imagePath: product.images[0]?.path ?? '',
    sizes,
  };
}
