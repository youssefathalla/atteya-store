/**
 * Product fields an admin edit locks, so catalogue tools never overwrite them.
 * Mirrors `LOCKABLE_PRODUCT_FIELDS` in src/app/core/services/products/product.constants.ts.
 */
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
