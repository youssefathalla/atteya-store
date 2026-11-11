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
    const hitsPerPage = Math.min(48, Math.max(1, options.hitsPerPage ?? 24));
    const filters = options.filters ? `inStock:true AND (${options.filters})` : 'inStock:true';

    const response = await client.searchForHits<Record<string, unknown>>({
      requests: [
        {
          indexName,
          query: trimmed,
          page,
          hitsPerPage,
          filters,
          // One result per model (index `distinct` on `distinctKey`).
          distinct: true,
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
   * When `disjunctiveFacets` are set, companion queries omit that attribute's
   * facetFilters so multi-select checkboxes keep sibling values (InstantSearch pattern).
   */
  async browseCatalog(options: CatalogBrowseOptions = {}): Promise<CatalogBrowseResult> {
    if (!this.isConfigured()) {
      return emptyBrowseResult(false);
    }

    const client = await this.#getClient();
    const indexName = this.#resolveCatalogIndexName(options.sort ?? 'featured');
    const page = Math.max(0, options.page ?? 0);
    const hitsPerPage = Math.min(96, Math.max(1, options.hitsPerPage ?? 48));
    const maxValuesPerFacet = options.maxValuesPerFacet ?? 50;
    const facetFilters = (options.facetFilters ?? []).map((entry) =>
      typeof entry === 'string' ? entry : [...entry],
    );
    const numericFilters = options.numericFilters ? [...options.numericFilters] : undefined;
    const facets = options.facets ? [...options.facets] : undefined;
    const disjunctive = options.disjunctiveFacets ?? [];

    interface HitRequest {
      indexName: string;
      query: string;
      page: number;
      hitsPerPage: number;
      filters?: string;
      facetFilters?: (string | string[])[];
      numericFilters?: string[];
      facets?: string[];
      maxValuesPerFacet?: number;
      distinct: boolean;
      facetingAfterDistinct: boolean;
    }

    const mainRequest: HitRequest = {
      indexName,
      query: '',
      page,
      hitsPerPage,
      filters: options.filters,
      facetFilters: facetFilters.length > 0 ? facetFilters : undefined,
      numericFilters,
      facets,
      maxValuesPerFacet,
      // One card per model (index `distinct` on `distinctKey`), and filter counts count models.
      distinct: true,
      facetingAfterDistinct: true,
    };

    const requests: HitRequest[] = [mainRequest];
    const companionAttrs: string[] = [];

    for (const attr of disjunctive) {
      if (!facetFilterTouchesAttr(facetFilters, attr)) continue;
      companionAttrs.push(attr);
    }
    // Variant-level facets (each colour variant is its own record) must be counted before
    // `distinct`, otherwise only the representative variant's values are counted and other
    // colours of a model never show up as options. Each variant of a model has its own colour,
    // so counting records still counts models per value.
    for (const attr of facets ?? []) {
      if (VARIANT_LEVEL_FACETS.has(attr) && !companionAttrs.includes(attr)) {
        companionAttrs.push(attr);
      }
    }

    for (const attr of companionAttrs) {
      const isDisjunctive = disjunctive.includes(attr) && facetFilterTouchesAttr(facetFilters, attr);
      requests.push({
        indexName,
        query: '',
        page: 0,
        hitsPerPage: 0,
        filters: options.filters,
        facetFilters: isDisjunctive
          ? withoutAttrFacetFilters(facetFilters, attr)
          : facetFilters.length > 0
            ? facetFilters
            : undefined,
        numericFilters,
        facets: [attr],
        maxValuesPerFacet,
        distinct: true,
        facetingAfterDistinct: !VARIANT_LEVEL_FACETS.has(attr),
      });
    }

    const response = await client.searchForHits<Record<string, unknown>>({
      requests,
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

    const mergedFacets: Record<string, Readonly<Record<string, number>>> = {
      ...normalizeFacets(first.facets),
    };
    for (let i = 0; i < companionAttrs.length; i++) {
      const attr = companionAttrs[i]!;
      const companion = response.results[i + 1];
      if (!companion) continue;
      const companionFacets = normalizeFacets(companion.facets);
      if (companionFacets[attr]) {
        mergedFacets[attr] = companionFacets[attr]!;
      }
    }

    return {
      configured: true,
      hits,
      totalHits: first.nbHits ?? hits.length,
      page: first.page ?? page,
      totalPages: first.nbPages ?? 1,
      facets: mergedFacets,
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

/** Facets whose values differ between colour variants of one model; counted before `distinct`. */
const VARIANT_LEVEL_FACETS: ReadonlySet<string> = new Set(['colors']);

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

function facetFilterTouchesAttr(
  facetFilters: readonly (string | readonly string[])[],
  attr: string,
): boolean {
  const prefix = `${attr}:`;
  for (const entry of facetFilters) {
    if (typeof entry === 'string') {
      if (entry.startsWith(prefix)) return true;
      continue;
    }
    if (entry.some((value) => value.startsWith(prefix))) return true;
  }
  return false;
}

function withoutAttrFacetFilters(
  facetFilters: readonly (string | readonly string[])[],
  attr: string,
): (string | string[])[] | undefined {
  const prefix = `${attr}:`;
  const kept: (string | string[])[] = [];
  for (const entry of facetFilters) {
    if (typeof entry === 'string') {
      if (!entry.startsWith(prefix)) kept.push(entry);
      continue;
    }
    const inner = entry.filter((value) => !value.startsWith(prefix));
    if (inner.length > 0) kept.push([...inner]);
  }
  return kept.length > 0 ? kept : undefined;
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
