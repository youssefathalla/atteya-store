import * as v from 'valibot';
import { idSchema, slugSchema, timestampSchema } from '@shared/schemas';

/**
 * Firestore favorite row. Converter may inject doc `id`; it is stripped.
 * `slug` is the product's address when it was saved and can be out of date (ATS-115 renamed
 * them once): always read the product by `productId`.
 */
export const FavoriteItemSchema = v.object({
  productId: idSchema,
  slug: slugSchema,
  addedAt: timestampSchema,
});
