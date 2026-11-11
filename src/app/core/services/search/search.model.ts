import type * as v from 'valibot';
import type { SearchHitSchema } from './search.schema';

export type SearchHit = v.InferOutput<typeof SearchHitSchema>;

export type SearchSort = 'relevance' | 'price-asc' | 'price-desc';

/** Shop / catalogue browse sort (empty-query Algolia). */
export type CatalogSort = 'featured' | 'newest' | 'price-asc' | 'price-desc';

export interface SearchQueryOptions {
  readonly query: string;
  readonly page?: number;
  readonly sort?: SearchSort;
  readonly filters?: string;
  /** Results per page (1–48). Defaults to 24, the `/search` grid size. */
  readonly hitsPerPage?: number;
}

export interface SearchResultPage {
  readonly configured: boolean;
  readonly hits: readonly SearchHit[];
  readonly totalHits: number;
  readonly page: number;
  readonly totalPages: number;
}

export interface FacetStats {
  readonly min: number;
  readonly max: number;
  readonly avg?: number;
  readonly sum?: number;
}

export interface CatalogBrowseOptions {
  readonly page?: number;
  readonly hitsPerPage?: number;
  readonly sort?: CatalogSort;
  /** Algolia `filters` string (AND/OR). */
  readonly filters?: string;
  /** Algolia facetFilters (OR within nested arrays, AND across). */
  readonly facetFilters?: readonly (string | readonly string[])[];
  readonly numericFilters?: readonly string[];
  readonly facets?: readonly string[];
  /**
   * Multi-select facets that need disjunctive counts (InstantSearch-style).
   * Companion queries omit that attribute's facetFilters so sibling values stay selectable.
   */
  readonly disjunctiveFacets?: readonly string[];
  readonly maxValuesPerFacet?: number;
}

export interface CatalogBrowseResult {
  readonly configured: boolean;
  readonly hits: readonly SearchHit[];
  readonly totalHits: number;
  readonly page: number;
  readonly totalPages: number;
  readonly facets: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly facetStats: Readonly<Record<string, FacetStats>>;
}
