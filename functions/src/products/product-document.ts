import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import type { ColorId } from './catalog-taxonomy.js';
import type { MappedOption, MappedOptionValue, MappedProduct, MappedVariant } from './product-mapper.js';
import { storedImage, type StoredImage } from './product-images.js';

export const LOCKABLE_FIELDS = [
  'type',
  'brandId',
  'modelGroup',
  'published',
  'categoryIds',
  'colors',
  'tags',
] as const;
export type LockableField = (typeof LOCKABLE_FIELDS)[number];

export interface StoredOptionValue {
  readonly id: string;
  readonly label: string;
  readonly swatch?: string;
  readonly color?: ColorId;
  readonly image?: StoredImage;
}

export interface StoredOption {
  readonly key: MappedOption['key'];
  readonly label: string;
  readonly values: readonly StoredOptionValue[];
}

export interface ProductSource {
  readonly system: 'easyorders';
  readonly id: string;
  readonly slug: string;
  readonly categoryIds: readonly string[];
  readonly updatedAt: string;
  readonly hash: string;
  readonly lastRunId: string;
  readonly missingSince: null;
}

export interface CatalogueSlice {
  readonly product: MappedProduct;
  readonly detailImages: readonly StoredImage[];
  readonly images: readonly StoredImage[];
  readonly options: readonly StoredOption[];
}

export function hashCatalogueSlice(slice: CatalogueSlice): string {
  const product = slice.product;
  const payload = {
    name: product.name,
    summary: product.summary,
    descriptionHtml: product.descriptionHtml,
    detailImages: slice.detailImages,
    categoryId: product.categoryId,
    categoryIds: product.categoryIds,
    type: product.type,
    brandId: product.brandId,
    modelGroup: product.modelGroup,
    currency: product.currency,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: slice.images,
    options: slice.options,
    colors: product.colors,
    trackStock: product.trackStock,
    variants: product.variants.map(storedVariant),
    inStock: product.inStock,
    published: product.published,
    sourceId: product.easyOrdersId,
    sourceSlug: product.sourceSlug,
    sourceCategoryIds: product.sourceCategoryIds,
    sourceUpdatedAt: product.sourceUpdatedAt,
  };
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

export function storedOptions(product: MappedProduct): StoredOption[] {
  return product.options.map((option) => ({
    key: option.key,
    label: option.label,
    values: option.values.map((value) => storedOptionValue(product.docId, value)),
  }));
}

export function productSource(product: MappedProduct, hash: string, runId: string): ProductSource {
  return {
    system: 'easyorders',
    id: product.easyOrdersId,
    slug: product.sourceSlug,
    categoryIds: product.sourceCategoryIds,
    updatedAt: product.sourceUpdatedAt,
    hash,
    lastRunId: runId,
    missingSince: null,
  };
}

export function createdAtStamp(iso: string): Timestamp {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return Timestamp.now();
  return Timestamp.fromDate(new Date(parsed));
}

export function emptyCounts(): ImportCounts {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedLocked: 0,
    imagesCopied: 0,
    imagesSkipped: 0,
    unpublishedMissing: 0,
  };
}

export interface ImportCounts {
  created: number;
  updated: number;
  unchanged: number;
  skippedLocked: number;
  imagesCopied: number;
  imagesSkipped: number;
  unpublishedMissing: number;
}

export function addCounts(left: ImportCounts, right: ImportCounts): ImportCounts {
  return {
    created: left.created + right.created,
    updated: left.updated + right.updated,
    unchanged: left.unchanged + right.unchanged,
    skippedLocked: left.skippedLocked + right.skippedLocked,
    imagesCopied: left.imagesCopied + right.imagesCopied,
    imagesSkipped: left.imagesSkipped + right.imagesSkipped,
    unpublishedMissing: left.unpublishedMissing + right.unpublishedMissing,
  };
}

function storedOptionValue(docId: string, value: MappedOptionValue): StoredOptionValue {
  const stored: {
    id: string;
    label: string;
    swatch?: string;
    color?: ColorId;
    image?: StoredImage;
  } = { id: value.id, label: value.label };
  if (value.swatch) stored.swatch = value.swatch;
  if (value.color) stored.color = value.color;
  if (value.image) stored.image = storedImage(docId, value.image);
  return stored;
}

function storedVariant(variant: MappedVariant): MappedVariant {
  return { id: variant.id, values: variant.values, stock: variant.stock };
}
