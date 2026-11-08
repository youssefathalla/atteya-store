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
import type { Product } from '@core/services/products/product.model';
import { cardShortDescription } from '@core/services/products/utils/card-short-description';
import type { SearchHit } from '@core/services/search/search.model';
import {
  PRODUCT_CARD_COLORWAY_CAP,
  type ProductCardColorway,
  type ProductCardData,
  type ProductCardMarketingBadge,
  type ProductCardPrice,
  type ProductCardSibling,
  type ProductCardSiblingGroups,
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

/** Strip full Product docs down to TransferState-safe sibling thumbs. */
export function toSiblingGroupsRecord(
  map: ReadonlyMap<string, readonly Product[]>,
): ProductCardSiblingGroups {
  const record: Record<string, ProductCardSibling[]> = {};
  for (const [group, list] of map) {
    record[group] = list.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      images: product.images.slice(0, 1).map((image) => ({
        path: image.path,
        alt: image.alt,
      })),
    }));
  }
  return record;
}

export function siblingGroupsMap(
  record: ProductCardSiblingGroups | undefined | null,
): ReadonlyMap<string, readonly ProductCardSibling[]> {
  if (!record) return new Map();
  return new Map(Object.entries(record));
}

/** Stable sorted unique model-group keys for resource params / TransferState. */
export function uniqueModelGroups(
  values: readonly (string | null | undefined)[],
): readonly string[] | undefined {
  const groups = [
    ...new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  ].sort();
  return groups.length > 0 ? groups : undefined;
}

export function colorwaysForProduct(
  product: Pick<Product, 'id' | 'slug' | 'name' | 'images' | 'modelGroup'>,
  siblingsByGroup: ReadonlyMap<string, readonly ProductCardSibling[]>,
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
  siblingsByGroup: ReadonlyMap<string, readonly ProductCardSibling[]>,
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
  siblingsByGroup: ReadonlyMap<string, readonly ProductCardSibling[]>,
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

export function searchHitToCardData(
  hit: SearchHit,
  price: ProductCardPrice,
  siblingsByGroup: ReadonlyMap<string, readonly ProductCardSibling[]>,
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
  product: Pick<ProductCardSibling, 'id' | 'slug' | 'name' | 'images'>,
): ProductCardColorway {
  const image = product.images[0];
  return {
    productId: product.id,
    slug: product.slug,
    imagePath: image?.path ?? '',
    imageAlt: image?.alt || product.name,
  };
}
