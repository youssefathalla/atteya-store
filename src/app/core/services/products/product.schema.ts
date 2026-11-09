import * as v from 'valibot';
import { idSchema, slugSchema, timestampSchema } from '@shared/schemas';
import { ImageAssetSchema } from '@shared/schemas/image.schema';
import { COLOR_IDS } from './catalog-taxonomy';
import { MARKETING_BADGE_KINDS, MARKETING_BADGE_STYLES } from './marketing-badge';
import { MAX_PRODUCT_PLAYERS, PlayerIdSchema } from './player.schema';
import { MAX_DETAIL_LINE, MAX_DETAIL_LINES } from './utils/product-details';
import { LOCKABLE_PRODUCT_FIELDS, PRODUCT_GENDER_IDS, PRODUCT_TYPE_IDS } from './product.constants';

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));
const countMap = v.record(v.string(), wholeNumber);
const tagSlugSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32), v.regex(/^[a-z0-9-]+$/));

export const MarketingBadgeSchema = v.object({
  kind: v.picklist(MARKETING_BADGE_KINDS),
  style: v.picklist(MARKETING_BADGE_STYLES),
});

export const ProductImageSchema = v.object({
  ...ImageAssetSchema.entries,
  sourceUrl: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
});

/**
 * One colour of the same model, kept on every product of that model by the
 * `onProductColorSiblingsChange` function (functions/src/products/color-siblings.ts).
 * Product cards read it, so a grid needs no extra read to show the other colours.
 */
export const ColorSiblingSchema = v.object({
  id: idSchema,
  slug: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  imagePath: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(512)), ''),
  imageAlt: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ''),
  inStock: v.optional(v.boolean(), false),
});

export const ProductOptionValueSchema = v.object({
  id: idSchema,
  label: v.pipe(v.string(), v.trim(), v.minLength(1)),
  swatch: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  color: v.optional(v.picklist(COLOR_IDS)),
  image: v.optional(ProductImageSchema),
});

export const ProductOptionSchema = v.object({
  key: v.picklist(['size', 'colour', 'gift', 'choice']),
  label: v.pipe(v.string(), v.trim(), v.minLength(1)),
  values: v.array(ProductOptionValueSchema),
});

export const ProductVariantSchema = v.object({
  id: idSchema,
  values: v.record(v.string(), v.pipe(v.string(), v.minLength(1))),
  stock: wholeNumber,
});

export const ProductSourceSchema = v.object({
  system: v.literal('easyorders'),
  id: idSchema,
  slug: v.string(),
  categoryIds: v.array(v.string()),
  updatedAt: v.string(),
  hash: v.pipe(v.string(), v.minLength(1)),
  lastRunId: v.pipe(v.string(), v.minLength(1)),
  missingSince: v.nullable(timestampSchema),
});

export const ProductSchema = v.pipe(
  v.object({
    id: idSchema,
    slug: slugSchema,
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    summary: v.nullable(v.pipe(v.string(), v.maxLength(300))),
    descriptionHtml: v.nullable(v.string()),
    /** Facts for the Materials / Specifications section, one per line. A bad list never drops the product. */
    details: v.optional(
      v.fallback(
        v.pipe(
          v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_DETAIL_LINE))),
          v.maxLength(MAX_DETAIL_LINES),
        ),
        [],
      ),
      [],
    ),
    detailImages: v.pipe(v.array(ProductImageSchema), v.maxLength(8)),
    categoryId: slugSchema,
    categoryIds: v.pipe(v.array(slugSchema), v.minLength(1), v.maxLength(10)),
    type: v.picklist(PRODUCT_TYPE_IDS),
    brandId: slugSchema,
    modelGroup: v.nullable(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))),
    gender: v.optional(v.picklist(PRODUCT_GENDER_IDS)),
    /** Every colour of the model in a fixed order (this product included). A bad list never drops the product. */
    colorSiblings: v.optional(v.fallback(v.pipe(v.array(ColorSiblingSchema), v.maxLength(12)), []), []),
    currency: v.literal('EGP'),
    price: wholeNumber,
    compareAtPrice: v.nullable(wholeNumber),
    images: v.pipe(v.array(ProductImageSchema), v.maxLength(8)),
    options: v.pipe(v.array(ProductOptionSchema), v.maxLength(8)),
    colors: v.optional(v.pipe(v.array(v.picklist(COLOR_IDS)), v.maxLength(12)), []),
    tags: v.optional(v.pipe(v.array(tagSlugSchema), v.maxLength(20)), []),
    /** Player ids from `settings/players` (Shop's Player filter). A bad list never drops the product. */
    players: v.optional(
      v.fallback(v.pipe(v.array(PlayerIdSchema), v.maxLength(MAX_PRODUCT_PLAYERS)), []),
      [],
    ),
    /** Merchandising badge (NEW / BESTSELLER / LIMITED EDITION). Distinct from freeform `tags`. */
    marketingBadge: v.optional(v.nullable(MarketingBadgeSchema), null),
    /**
     * Homepage New Arrivals flag end (inclusive). Null/missing = not flagged.
     * Distinct from `marketingBadge` NEW. Expiry is date-based; no separate boolean.
     */
    newArrivalUntil: v.optional(v.nullable(timestampSchema), null),
    stock: v.optional(wholeNumber),
    stockBySize: v.optional(v.record(v.string(), wholeNumber)),
    inStock: v.optional(v.boolean(), true),
    weightGrams: v.optional(
      v.fallback(
        // 0 g = never adds to the parcel (socks). null/missing = not set.
        v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000))),
        null,
      ),
    ),
    variants: v.pipe(v.array(ProductVariantSchema), v.maxLength(200)),
    published: v.boolean(),
    searchTokens: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(200)), []),
    lockedFields: v.array(v.picklist(LOCKABLE_PRODUCT_FIELDS)),
    source: v.nullable(ProductSourceSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }),
  v.check(
    (product) => product.categoryIds.includes(product.categoryId),
    'The product categories must include its main category.',
  ),
  v.check(
    (product) => product.compareAtPrice === null || product.compareAtPrice > product.price,
    'The original price must be higher than the selling price.',
  ),
);

export const CatalogSummarySchema = v.object({
  categories: countMap,
  types: countMap,
  brands: countMap,
  total: wholeNumber,
  updatedAt: timestampSchema,
});
