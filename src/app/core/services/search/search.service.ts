import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import type { LiteClient } from 'algoliasearch/lite';
import * as v from 'valibot';
import { environment } from '@env/environment';
import type {
  CatalogBrowseOptions,
  CatalogBrowseResult,
  CatalogSort,
  FacetStats,
  SearchHit,
  SearchQueryOptions,
  SearchResultPage,
  SearchSort,
} from './search.model';
import { SearchHitSchema } from './search.schema';

type LiteOptions = NonNullable<Parameters<typeof import('algoliasearch/lite').liteClient>[2]>;
type AlgoliaCache = NonNullable<LiteOptions['responsesCache']>;

/** No-op cache: every search hits Algolia, so offer and price changes show immediately. */
function createNoCache(): AlgoliaCache {
  return {
    get<TValue>(
      _key: unknown,
      defaultValue: () => Promise<TValue>,
      events: { miss: (value: TValue) => Promise<unknown> } = { miss: () => Promise.resolve() },
    ): Promise<TValue> {
      return defaultValue()
        .then((value) => Promise.all([value, events.miss(value)]))
        .then(([value]) => value);
    },
    set<TValue>(_key: unknown, value: TValue): Promise<TValue> {
      return Promise.resolve(value);
    },
    delete: () => Promise.resolve(),
    clear: () => Promise.resolve(),
  } as AlgoliaCache;
}

@Service()
export class SearchService {
  readonly #platformId = inject(PLATFORM_ID);
  #clientPromise: Promise<LiteClient> | null = null;

  isConfigured(): boolean {
    const { appId, searchKey, indexName } = environment.algolia;
    return (
      Boolean(appId && searchKey && indexName) &&
      !appId.startsWith('ALGOLIA_') &&
      !searchKey.startsWith('ALGOLIA_')
    );
  }

  /** DSN origin for `<link rel="preconnect">` on the search page. */
  preconnectOrigin(): string | null {
    if (!this.isConfigured()) return null;
    return `https://${environment.algolia.appId}-dsn.algolia.net`;
  }

  /** Start the Algolia client import before the first search. Browser only. */
  warm(): void {
    if (!isPlatformBrowser(this.#platformId) || !this.isConfigured()) return;
    void this.#getClient();
  }

  async search(options: SearchQueryOptions): Promise<SearchResultPage> {
    if (!this.isConfigured()) {
      return emptyResult(false);
    }

    const trimmed = options.query.trim();
    if (trimmed.length < 2) {
      return emptyResult(true);
    }

    const client = await this.#getClient();
    const indexName = this.#resolveIndexName(options.sort ?? 'relevance');
    const page = Math.max(0, options.page ?? 0);
    const filters = options.filters ? `inStock:true AND (${options.filters})` : 'inStock:true';

    const response = await client.searchForHits<Record<string, unknown>>({
      requests: [
        {
          indexName,
          query: trimmed,
          page,
          hitsPerPage: 24,
          filters,
        },
      ],
    });

    const first = response.results[0];
    if (!first) {
      return emptyResult(true);
    }

    const hits: SearchHit[] = [];
    for (const rawHit of first.hits) {
      const parsed = v.safeParse(SearchHitSchema, rawHit);
      if (parsed.success) {
        hits.push(parsed.output);
      }
    }

    return {
      configured: true,
      hits,
      totalHits: first.nbHits ?? hits.length,
      page: first.page ?? page,
      totalPages: first.nbPages ?? 1,
    };
  }

  /**
   * Empty-query catalogue browse for `/shop` and category shop headers.
   * Does not force `inStock:true` — the shop In stock filter opts in.
   */
  async browseCatalog(options: CatalogBrowseOptions = {}): Promise<CatalogBrowseResult> {
    if (!this.isConfigured()) {
      return emptyBrowseResult(false);
    }

    const client = await this.#getClient();
    const indexName = this.#resolveCatalogIndexName(options.sort ?? 'featured');
    const page = Math.max(0, options.page ?? 0);
    const hitsPerPage = Math.min(96, Math.max(1, options.hitsPerPage ?? 48));

    const response = await client.searchForHits<Record<string, unknown>>({
      requests: [
        {
          indexName,
          query: '',
          page,
          hitsPerPage,
          filters: options.filters,
          facetFilters: options.facetFilters
            ? options.facetFilters.map((entry) =>
                typeof entry === 'string' ? entry : [...entry],
              )
            : undefined,
          numericFilters: options.numericFilters ? [...options.numericFilters] : undefined,
          facets: options.facets ? [...options.facets] : undefined,
          maxValuesPerFacet: options.maxValuesPerFacet ?? 50,
        },
      ],
    });

    const first = response.results[0];
    if (!first) {
      return emptyBrowseResult(true);
    }

    const hits: SearchHit[] = [];
    for (const rawHit of first.hits) {
      const parsed = v.safeParse(SearchHitSchema, rawHit);
      if (parsed.success) {
        hits.push(parsed.output);
      }
    }

    return {
      configured: true,
      hits,
      totalHits: first.nbHits ?? hits.length,
      page: first.page ?? page,
      totalPages: first.nbPages ?? 1,
      facets: normalizeFacets(first.facets),
      facetStats: normalizeFacetStats(first.facets_stats),
    };
  }

  async clearCache(): Promise<void> {
    await (await this.#clientPromise)?.clearCache();
  }

  #resolveIndexName(sort: SearchSort): string {
    if (sort === 'price-asc') return environment.algolia.priceAscIndex;
    if (sort === 'price-desc') return environment.algolia.priceDescIndex;
    return environment.algolia.indexName;
  }

  #resolveCatalogIndexName(sort: CatalogSort): string {
    if (sort === 'price-asc') return environment.algolia.priceAscIndex;
    if (sort === 'price-desc') return environment.algolia.priceDescIndex;
    // Featured + Newest share the primary index (customRanking: inStock, createdAtMs).
    return environment.algolia.indexName;
  }

  #getClient(): Promise<LiteClient> {
    if (!this.#clientPromise) {
      this.#clientPromise = import('algoliasearch/lite').then(({ liteClient }) =>
        liteClient(environment.algolia.appId, environment.algolia.searchKey, {
          responsesCache: createNoCache(),
          requestsCache: createNoCache(),
        }),
      );
    }
    return this.#clientPromise;
  }
}

function emptyResult(configured: boolean): SearchResultPage {
  return {
    configured,
    hits: [],
    totalHits: 0,
    page: 0,
    totalPages: 0,
  };
}

function emptyBrowseResult(configured: boolean): CatalogBrowseResult {
  return {
    configured,
    hits: [],
    totalHits: 0,
    page: 0,
    totalPages: 0,
    facets: {},
    facetStats: {},
  };
}

function normalizeFacets(
  raw: Record<string, Record<string, number>> | undefined,
): Readonly<Record<string, Readonly<Record<string, number>>>> {
  if (!raw) return {};
  const out: Record<string, Readonly<Record<string, number>>> = {};
  for (const [key, values] of Object.entries(raw)) {
    out[key] = { ...values };
  }
  return out;
}

function normalizeFacetStats(
  raw: Record<string, { min?: number; max?: number; avg?: number; sum?: number }> | undefined,
): Readonly<Record<string, FacetStats>> {
  if (!raw) return {};
  const out: Record<string, FacetStats> = {};
  for (const [key, stats] of Object.entries(raw)) {
    if (typeof stats.min !== 'number' || typeof stats.max !== 'number') continue;
    out[key] = {
      min: stats.min,
      max: stats.max,
      avg: stats.avg,
      sum: stats.sum,
    };
  }
  return out;
}
