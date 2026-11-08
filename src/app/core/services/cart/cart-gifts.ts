import type { Offer } from '@core/services/offers/engine';
import { COLOR_PALETTE } from '@core/services/products/catalog-taxonomy';

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
