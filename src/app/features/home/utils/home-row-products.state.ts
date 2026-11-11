import { makeStateKey, type TransferState } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import type { MarketingBadge } from '@core/services/products/marketing-badge';
import type { Product, ProductImage } from '@core/services/products/product.model';
import type { ProductGenderId, ProductTypeId } from '@core/services/products/product.model';
import type { ColorId } from '@core/services/products/catalog-taxonomy';
import { timestampToMs } from '@core/services/products/utils/new-arrival';

/** JSON-safe product slice for homepage row TransferState. */
export interface HomeRowProductSeed {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly summary: string | null;
  readonly descriptionHtml: string | null;
  readonly categoryId: string;
  readonly categoryIds: readonly string[];
  readonly type: ProductTypeId;
  readonly brandId: string;
  readonly modelGroup: string | null;
  readonly gender: ProductGenderId | null;
  readonly colorSiblings: Product['colorSiblings'];
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly images: readonly ProductImage[];
  readonly options: Product['options'];
  readonly colors: readonly ColorId[];
  readonly tags: readonly string[];
  readonly marketingBadge: MarketingBadge | null;
  readonly newArrivalUntilMs: number | null;
  readonly published: boolean;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export const HOME_PADEL_ROW_KEY = makeStateKey<readonly HomeRowProductSeed[] | null>('home-padel-row');
export const HOME_NEW_ARRIVALS_ROW_KEY = makeStateKey<readonly HomeRowProductSeed[] | null>(
  'home-new-arrivals-row',
);

export function toHomeRowProductSeed(product: Product): HomeRowProductSeed {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    descriptionHtml: product.descriptionHtml,
    categoryId: product.categoryId,
    categoryIds: [...product.categoryIds],
    type: product.type,
    brandId: product.brandId,
    modelGroup: product.modelGroup,
    gender: product.gender ?? null,
    colorSiblings: product.colorSiblings.map((sibling) => ({ ...sibling })),
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: product.images.map((image) => ({ ...image })),
    options: product.options.map((option) => ({
      ...option,
      values: option.values.map((value) => ({ ...value })),
    })),
    colors: [...(product.colors ?? [])],
    tags: [...(product.tags ?? [])],
    marketingBadge: product.marketingBadge ? { ...product.marketingBadge } : null,
    newArrivalUntilMs: timestampToMs(product.newArrivalUntil),
    published: product.published,
    createdAtMs: timestampToMs(product.createdAt) ?? 0,
    updatedAtMs: timestampToMs(product.updatedAt) ?? 0,
  };
}

export function fromHomeRowProductSeed(seed: HomeRowProductSeed): Product {
  return {
    id: seed.id,
    slug: seed.slug,
    name: seed.name,
    summary: seed.summary,
    descriptionHtml: seed.descriptionHtml,
    details: [],
    detailImages: [],
    categoryId: seed.categoryId,
    categoryIds: [...seed.categoryIds],
    type: seed.type,
    brandId: seed.brandId,
    modelGroup: seed.modelGroup,
    ...(seed.gender ? { gender: seed.gender } : {}),
    colorSiblings: (seed.colorSiblings ?? []).map((sibling) => ({ ...sibling })),
    currency: 'EGP',
    price: seed.price,
    compareAtPrice: seed.compareAtPrice,
    images: seed.images.map((image) => ({ ...image })),
    options: seed.options.map((option) => ({
      ...option,
      values: option.values.map((value) => ({ ...value })),
    })),
    colors: [...seed.colors],
    tags: [...seed.tags],
    // Home cards never show players; the product page reads its own doc.
    players: [],
    marketingBadge: seed.marketingBadge ? { ...seed.marketingBadge } : null,
    newArrivalUntil: seed.newArrivalUntilMs != null ? Timestamp.fromMillis(seed.newArrivalUntilMs) : null,
    variants: [],
    published: seed.published,
    searchTokens: [],
    lockedFields: [],
    source: null,
    createdAt: Timestamp.fromMillis(seed.createdAtMs),
    updatedAt: Timestamp.fromMillis(seed.updatedAtMs),
    inStock: true,
  };
}

/** Browser: take SSR seed once. Server / missing key → undefined. */
export function takeHomeRowSeed(
  transfer: TransferState,
  key: ReturnType<typeof makeStateKey<readonly HomeRowProductSeed[] | null>>,
  isBrowser: boolean,
): readonly Product[] | undefined {
  if (!isBrowser || !transfer.hasKey(key)) return undefined;
  const raw = transfer.get(key, null);
  transfer.remove(key);
  if (raw == null) return [];
  return raw.map(fromHomeRowProductSeed);
}

export function putHomeRowSeed(
  transfer: TransferState,
  key: ReturnType<typeof makeStateKey<readonly HomeRowProductSeed[] | null>>,
  products: readonly Product[],
  isBrowser: boolean,
): void {
  if (isBrowser) return;
  transfer.set(key, products.map(toHomeRowProductSeed));
}
