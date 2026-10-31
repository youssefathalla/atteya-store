import * as v from 'valibot';
import { idSchema, slugSchema, timestampSchema } from '@shared/schemas';

/** Firestore favorite row. Converter may inject doc `id`; it is stripped. */
export const FavoriteItemSchema = v.object({
  productId: idSchema,
  slug: slugSchema,
  addedAt: timestampSchema,
});
