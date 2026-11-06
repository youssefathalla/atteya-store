import * as v from 'valibot';
import { idSchema, slugSchema, timestampSchema } from '@shared/schemas';
import { ImageAssetSchema } from '@shared/schemas/image.schema';

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));
const sortNumber = v.pipe(v.number(), v.integer());

export const CategorySchema = v.object({
  id: idSchema,
  slug: slugSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  parentId: v.nullable(idSchema),
  ancestorIds: v.pipe(v.array(idSchema), v.maxLength(1)),
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(125)),
  depth: v.picklist([0, 1]),
  sortOrder: sortNumber,
  image: v.nullable(ImageAssetSchema),
  published: v.boolean(),
  productCount: wholeNumber,
  /**
   * Shipping weight in grams for products in this category (Catalogue Tools → Shipping Weights).
   * null = no default on purpose; missing = the built-in default (`defaultWeightGrams()`).
   */
  // Written only by the `productWeights` callable, which checks the range.
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
