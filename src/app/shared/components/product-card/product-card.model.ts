import type {
  MarketingBadgeKind,
  MarketingBadgeStyle,
} from '@core/services/products/marketing-badge';

export interface ProductCardPrice {
  readonly price: number;
  readonly fromPrice: number | null;
  readonly listPrice: number | null;
  readonly partial: boolean;
  /** Always empty on listing cards; sale is bold + struck compare-at only (no % chips). */
  readonly badges: readonly string[];
}

export interface ProductCardColorway {
  readonly productId: string;
  readonly slug: string;
  readonly imagePath: string;
  readonly imageAlt: string;
}

/** Lean sibling shape — JSON-safe for resource TransferState (no Firestore Timestamps). */
export interface ProductCardSibling {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly images: readonly {
    readonly path: string;
    readonly alt: string;
  }[];
}

export type ProductCardSiblingGroups = Readonly<
  Record<string, readonly ProductCardSibling[]>
>;

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
  readonly imagePath: string | null;
  readonly imageAlt: string;
  readonly marketingBadge: ProductCardMarketingBadge | null;
  readonly colorways: readonly ProductCardColorway[];
  readonly price: ProductCardPrice;
}

/** Max photo thumbs before the trailing +N chip. */
export const PRODUCT_CARD_COLORWAY_CAP = 6;
