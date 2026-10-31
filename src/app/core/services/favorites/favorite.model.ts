import type * as v from 'valibot';
import type { FavoriteItemSchema } from './favorite.schema';

export type FavoriteItem = v.InferOutput<typeof FavoriteItemSchema>;

export const FAVORITES_COLLECTION = 'favorites';
export const FAVORITE_ITEMS = 'items';
/** Soft cap so a shopper's list stays manageable. */
export const MAX_FAVORITES = 100;
