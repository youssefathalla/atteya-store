import {
  displayPrice,
  type Offer,
  type PricedProduct,
  type PricingContext,
} from '@core/services/offers/engine';
import {
  marketingBadgeLabel,
  type MarketingBadge,
} from '@core/services/products/marketing-badge';
import { PRODUCT_GENDERS } from '@core/services/products/product.constants';
import type { Product, ProductGenderId } from '@core/services/products/product.model';
import { cardShortDescription } from '@core/services/products/utils/card-short-description';
import type { SearchHit } from '@core/services/search/search.model';
import {
  PRODUCT_CARD_COLORWAY_CAP,
  type ProductCardColorway,
  type ProductCardData,
  type ProductCardMarketingBadge,
  type ProductCardPrice,
} from './product-card.model';

type ColorSibling = Product['colorSiblings'][number];

export function toMarketingBadgeView(
  badge: MarketingBadge | null | undefined,
): ProductCardMarketingBadge | null {
  if (!badge) return null;
  return {
    kind: badge.kind,
    style: badge.style,
    label: marketingBadgeLabel(badge.kind),
  };
}

export function marketingBadgeFromSearchHit(
  hit: Pick<SearchHit, 'marketingBadgeKind' | 'marketingBadgeStyle'>,
): ProductCardMarketingBadge | null {
  const kind = hit.marketingBadgeKind;
  const style = hit.marketingBadgeStyle;
  if (!kind || !style) return null;
  return { kind, style, label: marketingBadgeLabel(kind) };
}

/**
 * The card's colour row from the model's stored `colorSiblings` list (no extra read).
 * Same rules as the product page's colour row: the list's fixed order, the card's own colour
 * in its place (underlined), other colours only while in stock, and nothing at all when there
 * is no other colour to show.
 */
export function colorwaysFromSiblings(
  self: ProductCardColorway,
  siblings: readonly ColorSibling[],
): readonly ProductCardColorway[] {
  const shown = siblings.filter((item) => item.id === self.productId || item.inStock);
  if (!shown.some((item) => item.id !== self.productId)) return [];
  const row = shown.map((item) => (item.id === self.productId ? self : toColorway(item)));
  return row.some((item) => item.productId === self.productId) ? row : [self, ...row];
}

/** First `PRODUCT_CARD_COLORWAY_CAP` colours (always keeping the card's own) plus the hidden count. */
export function visibleColorways(
  colorways: readonly ProductCardColorway[],
  currentId: string,
): {
  readonly shown: readonly ProductCardColorway[];
  readonly overflow: number;
} {
  if (colorways.length <= PRODUCT_CARD_COLORWAY_CAP) {
    return { shown: colorways, overflow: 0 };
  }
  let shown = colorways.slice(0, PRODUCT_CARD_COLORWAY_CAP);
  const current = colorways.find((item) => item.productId === currentId);
  if (current && !shown.includes(current)) {
    shown = [...shown.slice(0, PRODUCT_CARD_COLORWAY_CAP - 1), current];
  }
  return { shown, overflow: colorways.length - PRODUCT_CARD_COLORWAY_CAP };
}

/** "Men – T-shirts & polos"; just "Men" without a category; null when gender is not set. */
export function genderCategoryLine(
  gender: ProductGenderId | null,
  categoryName: string | null,
): string | null {
  if (!gender) return null;
  const label = PRODUCT_GENDERS.find((entry) => entry.id === gender)?.label ?? null;
  if (!label) return null;
  return categoryName ? `${label} – ${categoryName}` : label;
}

export function productToCardData(product: Product, price: ProductCardPrice): ProductCardData {
  const primary = product.images[0];
  const imagePath = primary?.path ?? null;
  const imageAlt = primary?.alt || product.name;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: cardShortDescription(product.summary, product.descriptionHtml),
    gender: product.gender ?? null,
    categoryId: product.categoryId,
    imagePath,
    imageAlt,
    marketingBadge: toMarketingBadgeView(product.marketingBadge),
    colorways: colorwaysFromSiblings(
      { productId: product.id, slug: product.slug, imagePath: imagePath ?? '', imageAlt },
      product.colorSiblings,
    ),
    price,
  };
}

/**
 * Listing price for one Algolia hit. With live `offers` (OffersService ready and not failed)
 * it re-prices through the shared engine; with `null` it uses the display fields Algolia stored.
 * Listing cards never show offer chips, so `badges` is always empty.
 */
export function searchHitCardPrice(
  hit: SearchHit,
  offers: readonly Offer[] | null,
  ctx: PricingContext,
): ProductCardPrice {
  if (offers) {
    const priced: PricedProduct = {
      productId: hit.objectID,
      name: hit.name,
      brandId: hit.brandId,
      categoryIds: hit.categoryIds,
      type: hit.type,
      modelGroup: hit.modelGroup,
      colors: hit.colors,
      sizes: hit.sizes,
      tags: hit.tags,
      price: hit.price,
      compareAtPrice: hit.compareAtPrice,
    };
    const d = displayPrice(priced, offers, ctx);
    return {
      price: d.partial ? hit.price : d.fromPrice,
      fromPrice: d.partial ? d.fromPrice : null,
      listPrice: d.listPrice,
      partial: d.partial,
      badges: [],
    };
  }

  const shown = hit.displayPrice ?? hit.price;
  // Records indexed before `pricePartial` existed keep the old behaviour until search is rebuilt.
  const varies = hit.pricePartial ?? shown !== hit.price;
  const listPrice = hit.listPrice ?? hit.compareAtPrice;
  return varies
    ? { price: hit.price, fromPrice: shown, listPrice, partial: true, badges: [] }
    : { price: shown, fromPrice: null, listPrice, partial: false, badges: [] };
}

export function searchHitToCardData(hit: SearchHit, price: ProductCardPrice): ProductCardData {
  const imagePath = hit.image?.path ?? null;
  const imageAlt = hit.image?.alt || hit.name;
  return {
    id: hit.objectID,
    slug: hit.slug,
    name: hit.name,
    shortDescription:
      hit.shortDescription?.trim() ||
      cardShortDescription(hit.summary, null),
    gender: hit.gender ?? null,
    // Records indexed before `categoryId` existed: the last id is the leaf (root first).
    categoryId: hit.categoryId ?? hit.categoryIds.at(-1) ?? null,
    imagePath,
    imageAlt,
    marketingBadge: marketingBadgeFromSearchHit(hit),
    colorways: colorwaysFromSiblings(
      { productId: hit.objectID, slug: hit.slug, imagePath: imagePath ?? '', imageAlt },
      hit.colorSiblings,
    ),
    price,
  };
}

function toColorway(sibling: ColorSibling): ProductCardColorway {
  return {
    productId: sibling.id,
    slug: sibling.slug,
    imagePath: sibling.imagePath,
    imageAlt: sibling.imageAlt || 'Other colour',
  };
}
