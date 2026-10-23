import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  OnInit,
  resource,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { SearchService, type SearchSort } from '@core/services/search';
import { SeoService } from '@core/services/seo';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';

const SORT_OPTIONS: readonly { readonly value: SearchSort; readonly label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

@Component({
  selector: 'app-search',
  host: { class: 'block w-full min-h-[60vh] container-content' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    AppImageFallbackDirective,
    EgpPricePipe,
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
  readonly #seo = inject(SeoService);
  readonly #destroyRef = inject(DestroyRef);

  #debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
    params: () => ({
      q: this.normalizedQuery(),
      sort: this.activeSort(),
      page: this.activePage(),
    }),
    loader: ({ params }) =>
      this.#searchService.search({
        query: params.q,
        sort: params.sort,
        page: params.page,
      }),
  });

  readonly hits = computed(() => this.resultsResource.value()?.hits ?? []);
  readonly totalHits = computed(() => this.resultsResource.value()?.totalHits ?? 0);
  readonly totalPages = computed(() => this.resultsResource.value()?.totalPages ?? 0);

  readonly skeletonCards = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  constructor() {
    this.#destroyRef.onDestroy(() => {
      if (this.#debounceTimer !== null) {
        clearTimeout(this.#debounceTimer);
      }
    });
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
      const trimmed = value.trim();
      void this.#navigate({
        q: trimmed.length >= 2 ? trimmed : null,
        sort: this.activeSort(),
        page: 0,
      });
    }, 300);
  }

  clearQuery(): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
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

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
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
