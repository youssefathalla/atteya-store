import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import type { LiteClient } from 'algoliasearch/lite';
import * as v from 'valibot';
import { environment } from '@env/environment';
import type { SearchHit, SearchQueryOptions, SearchResultPage, SearchSort } from './search.model';
import { SearchHitSchema } from './search.schema';

const CACHE_TTL_MS = 60_000;

@Service()
export class SearchService {
  readonly #platformId = inject(PLATFORM_ID);
  #clientPromise: Promise<LiteClient> | null = null;
  #cacheEpochMs = 0;

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
    const now = Date.now();
    if (this.#cacheEpochMs === 0) {
      this.#cacheEpochMs = now;
    } else if (now - this.#cacheEpochMs >= CACHE_TTL_MS) {
      await client.clearCache();
      this.#cacheEpochMs = now;
    }
    const indexName = this.#resolveIndexName(options.sort ?? 'relevance');
    const page = Math.max(0, options.page ?? 0);

    const response = await client.searchForHits<Record<string, unknown>>({
      requests: [
        {
          indexName,
          query: trimmed,
          page,
          hitsPerPage: 24,
          ...(options.filters ? { filters: options.filters } : {}),
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
    this.#cacheEpochMs = 0;
    if (!this.#clientPromise) return;
    const client = await this.#clientPromise;
    await client.clearCache();
  }

  #resolveIndexName(sort: SearchSort): string {
    if (sort === 'price-asc') return environment.algolia.priceAscIndex;
    if (sort === 'price-desc') return environment.algolia.priceDescIndex;
    return environment.algolia.indexName;
  }

  #getClient(): Promise<LiteClient> {
    if (!this.#clientPromise) {
      this.#clientPromise = import('algoliasearch/lite').then(({ liteClient }) =>
        liteClient(environment.algolia.appId, environment.algolia.searchKey),
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
