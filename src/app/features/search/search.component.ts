import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import { SearchService, type SearchSort } from '@core/services/search';
import { SeoService } from '@core/services/seo';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import type { ProductCardPrice } from '@shared/components/product-card/product-card.model';
import {
  searchHitCardPrice,
  searchHitToCardData,
} from '@shared/components/product-card/product-card.utils';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

const SORT_OPTIONS: readonly { readonly value: SearchSort; readonly label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

@Component({
  selector: 'app-search',
  host: { class: 'block w-full min-h-[60vh] container-content' },
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ProductCardComponent,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './search.component.html',
})
export class SearchComponent implements OnInit {
  readonly q = input<string>('');
  readonly sort = input<string>('relevance');
  readonly page = input<string>('0');

  readonly #router = inject(Router);
  readonly #searchService = inject(SearchService);
  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);
  readonly #seo = inject(SeoService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #document = inject(DOCUMENT);

  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #hydrated = signal(false);
  readonly #nowMs = signal(Date.now());

  readonly sortOptions = SORT_OPTIONS;
  readonly draftQuery = linkedSignal(() => this.q() ?? '');

  readonly normalizedQuery = computed(() => (this.q() ?? '').trim());

  readonly activeSort = computed<SearchSort>(() => {
    const raw = this.sort();
    if (raw === 'price-asc' || raw === 'price-desc') return raw;
    return 'relevance';
  });

  readonly activePage = computed(() => {
    const parsed = Number.parseInt(this.page() ?? '0', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });

  readonly hasMinQuery = computed(() => this.normalizedQuery().length >= 2);
  readonly isConfigured = computed(() => this.#searchService.isConfigured());

  readonly resultsResource = resource({
    params: () => {
      if (!this.isConfigured() || !this.hasMinQuery()) return undefined;
      return {
        q: this.normalizedQuery(),
        sort: this.activeSort(),
        page: this.activePage(),
      };
    },
    loader: ({ params }) =>
      this.#searchService.search({
        query: params.q,
        sort: params.sort,
        page: params.page,
      }),
    id: 'search-results',
  });

  readonly hits = computed(() => {
    if (this.resultsResource.error() || !this.resultsResource.hasValue()) return [];
    return this.resultsResource.value()?.hits ?? [];
  });
  readonly totalHits = computed(() => {
    if (this.resultsResource.error() || !this.resultsResource.hasValue()) return 0;
    return this.resultsResource.value()?.totalHits ?? 0;
  });
  readonly totalPages = computed(() => {
    if (this.resultsResource.error() || !this.resultsResource.hasValue()) return 0;
    return this.resultsResource.value()?.totalPages ?? 0;
  });

  readonly cardPrices = computed<ReadonlyMap<string, ProductCardPrice>>(() => {
    const hits = this.hits();
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : [];
    const ctx = {
      now: new Date(this.#nowMs()),
      signedIn: this.#hydrated() && Boolean(this.#auth.user()),
    };

    const map = new Map<string, ProductCardPrice>();
    for (const hit of hits) {
      map.set(hit.objectID, searchHitCardPrice(hit, liveMode ? offers : null, ctx));
    }
    return map;
  });

  readonly cards = computed(() => {
    const prices = this.cardPrices();
    return this.hits().flatMap((hit) => {
      const price = prices.get(hit.objectID);
      if (!price) return [];
      return [searchHitToCardData(hit, price)];
    });
  });

  readonly skeletonCards = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  constructor() {
    this.#preconnectAlgolia();
    if (isPlatformBrowser(this.#platformId)) {
      this.#searchService.warm();
    }

    afterNextRender(() => {
      this.#hydrated.set(true);
      this.#nowMs.set(Date.now());
      const id = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));
    });

    this.#destroyRef.onDestroy(() => {
      if (this.#debounceTimer !== null) {
        clearTimeout(this.#debounceTimer);
      }
    });

    if (isPlatformBrowser(this.#platformId)) {
      const win = this.#document.defaultView;
      let lastReturnRefreshMs = Date.now();
      const onReturn = () => {
        const now = Date.now();
        if (now - lastReturnRefreshMs < 30_000) return;
        lastReturnRefreshMs = now;
        this.#refresh();
      };
      const onVisible = () => {
        if (this.#document.visibilityState === 'visible') {
          onReturn();
        }
      };
      this.#document.addEventListener('visibilitychange', onVisible);
      win?.addEventListener('focus', onReturn);
      win?.addEventListener('pageshow', onReturn);
      this.#destroyRef.onDestroy(() => {
        this.#document.removeEventListener('visibilitychange', onVisible);
        win?.removeEventListener('focus', onReturn);
        win?.removeEventListener('pageshow', onReturn);
      });
    }
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Search | Atteya Store',
      description: 'Search rackets, apparel, bags, and accessories at Atteya Store.',
    });
  }

  onQueryInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    this.draftQuery.set(value);

    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
    }
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      const trimmed = value.trim();
      if (trimmed === this.normalizedQuery() && this.activePage() === 0) {
        this.#refresh();
        return;
      }
      void this.#navigate({
        q: trimmed.length >= 2 ? trimmed : null,
        sort: this.activeSort(),
        page: 0,
      });
    }, 300);
  }

  onSubmit(): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    const trimmed = this.draftQuery().trim();
    if (trimmed === this.normalizedQuery() && this.activePage() === 0) {
      this.#refresh();
      return;
    }
    void this.#navigate({
      q: trimmed.length >= 2 ? trimmed : null,
      sort: this.activeSort(),
      page: 0,
    });
  }

  clearQuery(): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    this.draftQuery.set('');
    void this.#navigate({ q: null, sort: this.activeSort(), page: 0 });
  }

  onSortChange(nextSort: SearchSort): void {
    void this.#navigate({
      q: this.normalizedQuery() || null,
      sort: nextSort,
      page: 0,
    });
  }

  goToPage(nextPage: number): void {
    if (nextPage < 0 || nextPage >= this.totalPages()) return;
    void this.#navigate({
      q: this.normalizedQuery() || null,
      sort: this.activeSort(),
      page: nextPage,
    });
  }

  #preconnectAlgolia(): void {
    const href = this.#searchService.preconnectOrigin();
    const head = this.#document.head;
    if (!href || !head) return;
    if (head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;

    const link = this.#document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.setAttribute('crossorigin', '');
    head.appendChild(link);
  }

  #refresh(): void {
    if (this.hasMinQuery()) {
      this.resultsResource.reload();
    }
  }

  async #navigate(params: {
    readonly q: string | null;
    readonly sort: SearchSort;
    readonly page: number;
  }): Promise<void> {
    await this.#router.navigate(['/search'], {
      queryParams: {
        q: params.q,
        sort: params.sort === 'relevance' ? null : params.sort,
        page: params.page > 0 ? String(params.page) : null,
      },
      replaceUrl: true,
    });
  }
}
