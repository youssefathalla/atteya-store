import { NgOptimizedImage } from '@angular/common';
import { Component, computed, DestroyRef, inject, linkedSignal, resource, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import { SearchService, type SearchResultPage } from '@core/services/search';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { searchHitCardPrice } from '@shared/components/product-card/product-card.utils';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';

/** Products shown in the panel before "See All Results". */
export const SEARCH_PANEL_MAX_RESULTS = 6;
/** Search starts from this many letters, same as `/search`. */
const MIN_QUERY_LENGTH = 2;
const TYPING_PAUSE_MS = 250;

/**
 * Quick search over the current page, opened by `SearchPanelService` from the
 * navbar and mobile bar search icons. Up to 6 matches as the shopper types,
 * then "See All Results" opens the full `/search` page.
 */
@Component({
  selector: 'app-search-panel',
  host: { class: 'search-panel' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    AppImageFallbackDirective,
    PrefetchProductDirective,
    ProductPriceComponent,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './search-panel.component.html',
})
export class SearchPanelComponent {
  readonly #dialogRef = inject(DialogRef);
  readonly #router = inject(Router);
  readonly #search = inject(SearchService);
  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);

  #typingTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #openedAtMs = Date.now();

  readonly isConfigured = this.#search.isConfigured();
  readonly skeletonRows = [0, 1, 2] as const;

  /** What is in the box right now. */
  readonly draft = signal('');
  /** The trimmed text the results are for, updated after a short typing pause. */
  readonly query = signal('');

  readonly hasMinQuery = computed(() => this.query().length >= MIN_QUERY_LENGTH);

  readonly results = resource({
    params: () => (this.isConfigured && this.hasMinQuery() ? { q: this.query() } : undefined),
    loader: ({ params }) => this.#search.search({ query: params.q, hitsPerPage: SEARCH_PANEL_MAX_RESULTS }),
  });

  /** Keeps the last results on screen while the next ones load, so the list doesn't blink per letter. */
  readonly shownPage = linkedSignal<SearchResultPage | undefined, SearchResultPage | undefined>({
    source: () => (this.results.hasValue() ? this.results.value() : undefined),
    computation: (next, previous) => next ?? (this.results.isLoading() ? previous?.value : undefined),
  });

  readonly items = computed(() => {
    const page = this.shownPage();
    if (!page) return [];
    const liveOffers = this.#offers.ready() && !this.#offers.failed() ? this.#offers.all() : null;
    const ctx = { now: new Date(this.#openedAtMs), signedIn: Boolean(this.#auth.user()) };
    return page.hits.slice(0, SEARCH_PANEL_MAX_RESULTS).map((hit) => ({
      id: hit.objectID,
      slug: hit.slug,
      name: hit.name,
      brandName: hit.brandName,
      imagePath: hit.image?.path ?? null,
      price: searchHitCardPrice(hit, liveOffers, ctx),
    }));
  });

  readonly isRefreshing = computed(() => this.results.isLoading() && this.shownPage() !== undefined);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#clearTimer());
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.draft.set(target.value);
    this.#clearTimer();

    const trimmed = target.value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Back under 2 letters: show the hint straight away, no pause.
      this.query.set(trimmed);
      return;
    }
    this.#typingTimer = setTimeout(() => {
      this.#typingTimer = null;
      this.query.set(trimmed);
    }, TYPING_PAUSE_MS);
  }

  clear(input: HTMLInputElement): void {
    this.#clearTimer();
    this.draft.set('');
    this.query.set('');
    input.focus();
  }

  /** Enter in the box and "See All Results" both open the full search page. */
  seeAll(): void {
    const q = this.draft().trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    this.#clearTimer();
    this.close();
    void this.#router.navigate(['/search'], { queryParams: { q } });
  }

  close(): void {
    this.#dialogRef.close();
  }

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  #clearTimer(): void {
    if (this.#typingTimer !== null) {
      clearTimeout(this.#typingTimer);
      this.#typingTimer = null;
    }
  }
}
