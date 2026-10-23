import {
  displayPrice,
  type Offer,
  type PricedProduct,
} from '../offers/engine/index.js';
import { PRODUCT_TYPES, sizeRank, type ProductTypeId } from '../products/catalog-mapping.js';
import { categoryIdsFor, DEFAULT_CATEGORY_FOR_TYPE } from '../products/catalog-taxonomy.js';
import type { CachedBrandInfo, CachedCategoryInfo } from './catalog-cache.js';

export interface SearchRecordImage {
  readonly path: string;
  readonly alt: string;
}

export interface SearchHierarchicalCategories {
  readonly lvl0: readonly string[];
  readonly lvl1: readonly string[];
}

export interface SearchOfferFields {
  readonly listPrice: number;
  readonly displayPrice: number;
  readonly hasOffer: boolean;
  readonly offerIds: readonly string[];
  readonly offerBadges: readonly string[];
  readonly maxDiscountPercent: number;
  readonly [key: string]: unknown;
}

export interface ProductSearchRecord extends SearchOfferFields {
  readonly objectID: string;
  readonly name: string;
  readonly slug: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly modelGroup: string | null;
  readonly categoryIds: readonly string[];
  readonly hierarchicalCategories: SearchHierarchicalCategories;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly discountPercent: number;
  readonly onSale: boolean;
  readonly sizes: readonly string[];
  readonly inStock: boolean;
  readonly image: SearchRecordImage | null;
  readonly createdAtMs: number;
  readonly [key: string]: unknown;
}

const TYPE_LABEL_BY_ID = new Map<string, string>(
  PRODUCT_TYPES.map((entry) => [entry.id, entry.label]),
);

export function toSearchRecord(
  productId: string,
  data: Record<string, unknown> | undefined | null,
  categoriesById: ReadonlyMap<string, CachedCategoryInfo>,
  brandsById: ReadonlyMap<string, CachedBrandInfo>,
  offers: readonly Offer[] = [],
  now: Date = new Date(),
): ProductSearchRecord | null {
  if (!data || data['published'] !== true) {
    return null;
  }

  const name = readString(data['name']);
  const slug = readString(data['slug']);
  const brandId = readString(data['brandId']);
  const type = readString(data['type']);
  if (!name || !slug || !brandId || !type) {
    return null;
  }

  const brandName = brandsById.get(brandId)?.name ?? brandId;
  const typeLabel = TYPE_LABEL_BY_ID.get(type) ?? type;
  const modelGroup =
    typeof data['modelGroup'] === 'string' && data['modelGroup'].trim()
      ? data['modelGroup'].trim()
      : null;

  const categoryIds = resolveCategoryIds(data, type);
  const hierarchicalCategories = buildHierarchicalCategories(categoryIds, categoriesById);

  const price = readWholeEgp(data['price']);
  const rawCompare = data['compareAtPrice'];
  const compareAtPrice =
    typeof rawCompare === 'number' && Number.isFinite(rawCompare) && rawCompare > price
      ? Math.round(rawCompare)
      : null;

  const onSale = compareAtPrice !== null && compareAtPrice > price && price > 0;
  const discountPercent =
    onSale && compareAtPrice !== null
      ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
      : 0;

  const sizes = extractSizes(data['options']);
  const inStock = computeInStock(data['trackStock'], data['variants']);
  const image = extractPrimaryImage(data['images'], name);
  const createdAtMs = extractTimestampMs(data['createdAt']);

  const offerFields = computeProductOfferFields(
    productId,
    data,
    offers,
    now,
    {
      name,
      brandId,
      categoryIds,
      type,
      modelGroup,
      sizes,
      price,
      compareAtPrice,
    },
  );

  return {
    objectID: productId,
    name,
    slug,
    brandId,
    brandName,
    type,
    typeLabel,
    modelGroup,
    categoryIds,
    hierarchicalCategories,
    price,
    compareAtPrice,
    discountPercent,
    onSale,
    sizes,
    inStock,
    image,
    createdAtMs,
    ...offerFields,
  };
}

export function computeProductOfferFields(
  productId: string,
  data: Record<string, unknown>,
  offers: readonly Offer[],
  now: Date = new Date(),
  precomputed?: {
    readonly name: string;
    readonly brandId: string;
    readonly categoryIds: readonly string[];
    readonly type: string;
    readonly modelGroup: string | null;
    readonly sizes: readonly string[];
    readonly price: number;
    readonly compareAtPrice: number | null;
  },
): SearchOfferFields {
  const name = precomputed?.name ?? readString(data['name']);
  const brandId = precomputed?.brandId ?? readString(data['brandId']);
  const type = precomputed?.type ?? readString(data['type']);
  const categoryIds = precomputed?.categoryIds ?? resolveCategoryIds(data, type);
  const modelGroup =
    precomputed !== undefined
      ? precomputed.modelGroup
      : typeof data['modelGroup'] === 'string' && data['modelGroup'].trim()
        ? data['modelGroup'].trim()
        : null;
  const sizes = precomputed?.sizes ?? extractSizes(data['options']);
  const price = precomputed?.price ?? readWholeEgp(data['price']);
  const rawCompare = data['compareAtPrice'];
  const compareAtPrice =
    precomputed !== undefined
      ? precomputed.compareAtPrice
      : typeof rawCompare === 'number' && Number.isFinite(rawCompare) && rawCompare > price
        ? Math.round(rawCompare)
        : null;

  const colors = Array.isArray(data['colors'])
    ? data['colors'].filter((c): c is string => typeof c === 'string')
    : [];
  const tags = Array.isArray(data['tags'])
    ? data['tags'].filter((t): t is string => typeof t === 'string')
    : [];

  const pricedProduct: PricedProduct = {
    productId,
    name,
    brandId,
    categoryIds,
    type,
    modelGroup,
    colors,
    sizes,
    tags,
    price,
    compareAtPrice,
  };

  const publicEveryoneOffers = offers.filter(
    (offer) => offer.visibility === 'public' && offer.audience === 'everyone' && !offer.requiresCode,
  );

  const result = displayPrice(pricedProduct, publicEveryoneOffers, {
    now,
    signedIn: false,
  });

  const offerBadges = result.badges.map((badge) => badge.text).slice(0, 3);
  const hasOffer = result.offerIds.length > 0;

  return {
    listPrice: result.listPrice,
    displayPrice: result.fromPrice,
    hasOffer,
    offerIds: result.offerIds,
    offerBadges,
    maxDiscountPercent: result.maxDiscountPercent,
  };
}

export function searchRecordsEqual(
  left: ProductSearchRecord | null,
  right: ProductSearchRecord | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveCategoryIds(data: Record<string, unknown>, type: string): string[] {
  const raw = data['categoryIds'];
  if (Array.isArray(raw)) {
    const cleaned = raw.filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0,
    );
    if (cleaned.length > 0) {
      return Array.from(new Set(cleaned));
    }
  }
  const defaultLeaf =
    DEFAULT_CATEGORY_FOR_TYPE[type as ProductTypeId] ?? readString(data['categoryId']);
  return defaultLeaf ? categoryIdsFor(defaultLeaf) : [];
}

function buildHierarchicalCategories(
  categoryIds: readonly string[],
  categoriesById: ReadonlyMap<string, CachedCategoryInfo>,
): SearchHierarchicalCategories {
  const lvl0: string[] = [];
  const lvl1: string[] = [];

  for (const id of categoryIds) {
    const category = categoriesById.get(id);
    if (!category) continue;
    if (category.depth === 0 || category.parentId === null) {
      if (!lvl0.includes(category.name)) {
        lvl0.push(category.name);
      }
    } else {
      const parentName = categoriesById.get(category.parentId)?.name;
      if (parentName) {
        if (!lvl0.includes(parentName)) {
          lvl0.push(parentName);
        }
        const pathLabel = `${parentName} > ${category.name}`;
        if (!lvl1.includes(pathLabel)) {
          lvl1.push(pathLabel);
        }
      } else if (!lvl0.includes(category.name)) {
        lvl0.push(category.name);
      }
    }
  }

  return { lvl0, lvl1 };
}

function extractSizes(rawOptions: unknown): string[] {
  if (!Array.isArray(rawOptions)) return [];
  const found: string[] = [];

  for (const option of rawOptions) {
    if (typeof option !== 'object' || option === null) continue;
    const key = (option as { key?: unknown }).key;
    if (key !== 'size') continue;
    const values = (option as { values?: unknown }).values;
    if (!Array.isArray(values)) continue;

    for (const val of values) {
      if (typeof val !== 'object' || val === null) continue;
      const label = readString((val as { label?: unknown }).label);
      if (label && !found.includes(label)) {
        found.push(label);
      }
    }
  }

  return found.sort((a, b) => sizeRank(a) - sizeRank(b));
}

function computeInStock(rawTrackStock: unknown, rawVariants: unknown): boolean {
  if (rawTrackStock === false) return true;
  if (!Array.isArray(rawVariants) || rawVariants.length === 0) return false;

  return rawVariants.some((variant) => {
    if (typeof variant !== 'object' || variant === null) return false;
    const stock = (variant as { stock?: unknown }).stock;
    return typeof stock === 'number' && Number.isFinite(stock) && stock > 0;
  });
}

function extractPrimaryImage(rawImages: unknown, fallbackAlt: string): SearchRecordImage | null {
  if (!Array.isArray(rawImages) || rawImages.length === 0) return null;
  const first = rawImages[0];
  if (typeof first !== 'object' || first === null) return null;
  const path = readString((first as { path?: unknown }).path);
  if (!path) return null;
  const alt = readString((first as { alt?: unknown }).alt) || fallbackAlt;
  return { path, alt };
}

function extractTimestampMs(raw: unknown): number {
  if (typeof raw === 'object' && raw !== null) {
    const toMillis = (raw as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const ms = (toMillis as () => number).call(raw);
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
    const seconds =
      (raw as { _seconds?: unknown; seconds?: unknown })._seconds ??
      (raw as { seconds?: unknown }).seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return Math.round(seconds * 1000);
    }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function readWholeEgp(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw);
}
