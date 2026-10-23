import type * as v from 'valibot';
import type { SearchHitSchema } from './search.schema';

export type SearchHit = v.InferOutput<typeof SearchHitSchema>;

export type SearchSort = 'relevance' | 'price-asc' | 'price-desc';

export interface SearchQueryOptions {
  readonly query: string;
  readonly page?: number;
  readonly sort?: SearchSort;
  readonly filters?: string;
}

export interface SearchResultPage {
  readonly configured: boolean;
  readonly hits: readonly SearchHit[];
  readonly totalHits: number;
  readonly page: number;
  readonly totalPages: number;
}
