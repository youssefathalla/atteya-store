import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import type { LiteClient } from 'algoliasearch/lite';
import * as v from 'valibot';
import { environment } from '@env/environment';
import type { SearchHit, SearchQueryOptions, SearchResultPage, SearchSort } from './search.model';
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

  async search(options: SearchQueryOptions): Promise<SearchResultPage> {
    if (!isPlatformBrowser(this.#platformId)) {
      return emptyResult(true);
    }
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

  async clearCache(): Promise<void> {
    await (await this.#clientPromise)?.clearCache();
  }

  #resolveIndexName(sort: SearchSort): string {
    if (sort === 'price-asc') return environment.algolia.priceAscIndex;
    if (sort === 'price-desc') return environment.algolia.priceDescIndex;
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
