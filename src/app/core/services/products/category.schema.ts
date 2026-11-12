import * as v from 'valibot';
import { idSchema, slugSchema, timestampSchema } from '@shared/schemas';
import { ImageAssetSchema } from '@shared/schemas/image.schema';
import { CATEGORY_DETAILS_TITLES, CATEGORY_SIZE_CHARTS } from './catalog-taxonomy';

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));
const sortNumber = v.pipe(v.number(), v.integer());

export const CategorySchema = v.object({
  id: idSchema,
  slug: slugSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  parentId: v.nullable(idSchema),
  ancestorIds: v.pipe(v.array(idSchema), v.maxLength(1)),
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(125)),
  /** Optional short text staff write in Categories & Brands; seed categories have none. */
  description: v.optional(v.pipe(v.string(), v.maxLength(500))),
  /** "Name on Shop Tabs" for a top-level category (ATS-249); missing = the default tab name. */
  shopLabel: v.optional(v.pipe(v.string(), v.maxLength(30))),
  /**
   * Size & Fit chart on product pages (ATS-250): null = same as the parent; missing = the built-in
   * default (`BUILT_IN_CATEGORY_PAGE`), else the parent's. Written only by `saveCategory` and the migration.
   */
  sizeChart: v.optional(v.nullable(v.picklist(CATEGORY_SIZE_CHARTS))),
  /** Materials or Specifications on product pages; null and missing as for `sizeChart`. */
  detailsTitle: v.optional(v.nullable(v.picklist(CATEGORY_DETAILS_TITLES))),
  depth: v.picklist([0, 1]),
  sortOrder: sortNumber,
  image: v.nullable(ImageAssetSchema),
  published: v.boolean(),
  productCount: wholeNumber,
  /**
   * Shipping weight in grams for products in this category (Catalogue Tools → Shipping Weights).
   * null = no default on purpose; missing = the built-in default (`defaultWeightGrams()`).
   */
  // Written only by the `productWeights` and `saveCategory` callables, which check the range.
  defaultWeightGrams: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000))),
  ),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const BrandSchema = v.object({
  id: idSchema,
  slug: slugSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  logo: v.nullable(ImageAssetSchema),
  sortOrder: sortNumber,
  published: v.boolean(),
  productCount: wholeNumber,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
