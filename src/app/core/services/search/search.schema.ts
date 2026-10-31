import * as v from 'valibot';
import { MARKETING_BADGE_KINDS, MARKETING_BADGE_STYLES } from '@core/services/products/marketing-badge';

export const SearchHitImageSchema = v.object({
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(512)),
  alt: v.pipe(v.string(), v.trim(), v.maxLength(160)),
});

export const SearchHitSchema = v.object({
  objectID: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  slug: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  brandId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  brandName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  type: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  typeLabel: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  modelGroup: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(120)), null),
  categoryIds: v.optional(v.array(v.string()), []),
  price: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000)),
  compareAtPrice: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000)),
    null,
  ),
  discountPercent: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 0),
  onSale: v.optional(v.boolean(), false),
  listPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000))),
  displayPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000))),
  hasOffer: v.optional(v.boolean(), false),
  offerIds: v.optional(v.array(v.string()), []),
  offerBadges: v.optional(v.array(v.string()), []),
  maxDiscountPercent: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
    0,
  ),
  pricePartial: v.optional(v.boolean()),
  colors: v.optional(v.array(v.string()), []),
  sizes: v.optional(v.array(v.string()), []),
  tags: v.optional(v.array(v.string()), []),
  marketingBadgeKind: v.optional(
    v.nullable(v.picklist(MARKETING_BADGE_KINDS)),
    null,
  ),
  marketingBadgeStyle: v.optional(
    v.nullable(v.picklist(MARKETING_BADGE_STYLES)),
    null,
  ),
  summary: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(300))), null),
  // Clip instead of reject so a pre-cap Algolia record never drops the whole hit.
  shortDescription: v.optional(
    v.pipe(
      v.string(),
      v.transform((value) => (value.length > 300 ? value.slice(0, 300).trimEnd() : value)),
    ),
    '',
  ),
  inStock: v.optional(v.boolean(), true),
  image: v.nullable(SearchHitImageSchema, null),
  createdAtMs: v.optional(v.number(), 0),
});
