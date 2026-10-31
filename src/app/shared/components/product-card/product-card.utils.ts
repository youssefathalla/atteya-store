import {
  marketingBadgeLabel,
  type MarketingBadge,
} from '@core/services/products/marketing-badge';
import type { Product } from '@core/services/products/product.model';
import { cardShortDescription } from '@core/services/products/utils/card-short-description';
import type { SearchHit } from '@core/services/search/search.model';
import {
  PRODUCT_CARD_COLORWAY_CAP,
  type ProductCardColorway,
  type ProductCardData,
  type ProductCardMarketingBadge,
  type ProductCardPrice,
} from './product-card.model';

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

export function colorwaysForProduct(
  product: Pick<Product, 'id' | 'slug' | 'name' | 'images' | 'modelGroup'>,
  siblingsByGroup: ReadonlyMap<string, readonly Product[]>,
): readonly ProductCardColorway[] {
  const self = toColorway(product);
  const groupKey = product.modelGroup?.trim() ?? '';
  if (!groupKey) return [self];

  const group = siblingsByGroup.get(groupKey) ?? [];
  const others = group
    .filter((item) => item.id !== product.id)
    .map((item) => toColorway(item));

  // Current colour first so the selected underline matches the card product.
  return [self, ...others];
}

export function colorwaysForSearchHit(
  hit: Pick<SearchHit, 'objectID' | 'slug' | 'name' | 'image' | 'modelGroup'>,
  siblingsByGroup: ReadonlyMap<string, readonly Product[]>,
): readonly ProductCardColorway[] {
  const self: ProductCardColorway = {
    productId: hit.objectID,
    slug: hit.slug,
    imagePath: hit.image?.path ?? '',
    imageAlt: hit.image?.alt || hit.name,
  };
  const groupKey = hit.modelGroup?.trim() ?? '';
  if (!groupKey) return [self];

  const group = siblingsByGroup.get(groupKey) ?? [];
  const others = group
    .filter((item) => item.id !== hit.objectID)
    .map((item) => toColorway(item));
  return [self, ...others];
}

export function visibleColorways(colorways: readonly ProductCardColorway[]): {
  readonly shown: readonly ProductCardColorway[];
  readonly overflow: number;
} {
  if (colorways.length <= PRODUCT_CARD_COLORWAY_CAP) {
    return { shown: colorways, overflow: 0 };
  }
  return {
    shown: colorways.slice(0, PRODUCT_CARD_COLORWAY_CAP),
    overflow: colorways.length - PRODUCT_CARD_COLORWAY_CAP,
  };
}

export function productToCardData(
  product: Product,
  price: ProductCardPrice,
  siblingsByGroup: ReadonlyMap<string, readonly Product[]>,
): ProductCardData {
  const primary = product.images[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: cardShortDescription(product.summary, product.descriptionHtml),
    imagePath: primary?.path ?? null,
    imageAlt: primary?.alt || product.name,
    marketingBadge: toMarketingBadgeView(product.marketingBadge),
    colorways: colorwaysForProduct(product, siblingsByGroup),
    price,
  };
}

export function searchHitToCardData(
  hit: SearchHit,
  price: ProductCardPrice,
  siblingsByGroup: ReadonlyMap<string, readonly Product[]>,
): ProductCardData {
  return {
    id: hit.objectID,
    slug: hit.slug,
    name: hit.name,
    shortDescription:
      hit.shortDescription?.trim() ||
      cardShortDescription(hit.summary, null),
    imagePath: hit.image?.path ?? null,
    imageAlt: hit.image?.alt || hit.name,
    marketingBadge: marketingBadgeFromSearchHit(hit),
    colorways: colorwaysForSearchHit(hit, siblingsByGroup),
    price,
  };
}

function toColorway(
  product: Pick<Product, 'id' | 'slug' | 'name' | 'images'>,
): ProductCardColorway {
  const image = product.images[0];
  return {
    productId: product.id,
    slug: product.slug,
    imagePath: image?.path ?? '',
    imageAlt: image?.alt || product.name,
  };
}
