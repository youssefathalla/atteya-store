import * as v from 'valibot';
import { BrandSchema, CategorySchema } from './category.schema';
import {
  LOCKABLE_PRODUCT_FIELDS,
  PRODUCT_BRAND_IDS,
  PRODUCT_CATEGORY_IDS,
  PRODUCT_TYPE_IDS,
} from './product.constants';
import {
  CatalogSummarySchema,
  ProductImageSchema,
  ProductOptionSchema,
  ProductSchema,
  ProductVariantSchema,
} from './product.schema';

export type Product = v.InferOutput<typeof ProductSchema>;
export type ProductImage = v.InferOutput<typeof ProductImageSchema>;
export type ProductOption = v.InferOutput<typeof ProductOptionSchema>;
export type ProductVariant = v.InferOutput<typeof ProductVariantSchema>;
export type CatalogSummary = v.InferOutput<typeof CatalogSummarySchema>;
export type Category = v.InferOutput<typeof CategorySchema>;
export type Brand = v.InferOutput<typeof BrandSchema>;

export interface CategoryTreeNode extends Category {
  readonly children: readonly Category[];
}

export type ProductCategoryId = (typeof PRODUCT_CATEGORY_IDS)[number];
export type ProductTypeId = (typeof PRODUCT_TYPE_IDS)[number];
export type BrandId = (typeof PRODUCT_BRAND_IDS)[number];
export type LockableProductField = (typeof LOCKABLE_PRODUCT_FIELDS)[number];

export interface ProductListQuery {
  readonly categoryId?: string;
  readonly type?: ProductTypeId;
  readonly brandId?: string;
  readonly limit: number;
}

export type ProductCountQuery = Omit<ProductListQuery, 'limit'>;
