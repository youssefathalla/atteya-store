import type { MarketingBadgeKind, MarketingBadgeStyle } from '@core/services/products/marketing-badge';
import type { ProductGenderId } from '@core/services/products/product.model';

export interface ProductCardPrice {
  readonly price: number;
  readonly fromPrice: number | null;
  readonly listPrice: number | null;
  readonly partial: boolean;
  /** Always empty on listing cards; sale is bold + struck compare-at only (no % chips). */
  readonly badges: readonly string[];
}

/** One colour in the card's colour row (always includes the card's own product, even when it is the only colour). */
export interface ProductCardColorway {
  readonly productId: string;
  readonly slug: string;
  readonly imagePath: string;
  readonly imageAlt: string;
}

export interface ProductCardMarketingBadge {
  readonly kind: MarketingBadgeKind;
  readonly style: MarketingBadgeStyle;
  readonly label: string;
}

export interface ProductCardData {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string;
  /** With `categoryId`, gives the second line ("Men – T-shirts & polos"); null = not set. */
  readonly gender: ProductGenderId | null;
  /** Main (leaf) category id; null when unknown. */
  readonly categoryId: string | null;
  readonly imagePath: string | null;
  readonly imageAlt: string;
  readonly marketingBadge: ProductCardMarketingBadge | null;
  readonly colorways: readonly ProductCardColorway[];
  readonly price: ProductCardPrice;
}

/** Max colour photos under the card photo before the trailing +N chip. */
export const PRODUCT_CARD_COLORWAY_CAP = 8;
