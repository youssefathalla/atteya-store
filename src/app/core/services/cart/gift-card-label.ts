import { COLOR_PALETTE, type ColorId } from '@core/services/products/catalog-taxonomy';

/** One colour under a gift card: its palette id (for the dot) and its name. */
export interface GiftCardColour {
  readonly id: ColorId;
  readonly label: string;
}

/** The card's colours in the product's own order, palette entries only (unknown ids are left out). */
export function giftCardColours(colors: readonly string[]): GiftCardColour[] {
  return colors.flatMap((id) => {
    const entry = COLOR_PALETTE.find((colour) => colour.id === id);
    return entry ? [{ id: entry.id, label: entry.label }] : [];
  });
}

/**
 * The name on a gift card: the product's full name, without colour words at its end, because the
 * colour line under it already says them ("Adidas Simple Polo White" -> "Adidas Simple Polo").
 */
export function giftCardName(name: string, colours: readonly GiftCardColour[]): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const colourWords = new Set(colours.map((colour) => colour.label.toLowerCase()));
  while (words.length > 1 && colourWords.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(' ');
}
