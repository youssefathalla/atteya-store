import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { SeoService } from '@core/services/seo';
import { SearchService, type SearchHit } from '@core/services/search';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ShopFiltersDrawerComponent } from './components/shop-filters-drawer/shop-filters-drawer.component';
import { ShopFiltersComponent } from './components/shop-filters/shop-filters.component';
import { ShopGridComponent } from './components/shop-grid/shop-grid.component';
import { ShopHeaderComponent } from './components/shop-header/shop-header.component';
import {
  DEFAULT_SHOP_FILTERS,
  SHOP_TABS,
  type ShopFilterState,
} from './models/shop.model';
import {
  brandOptionsFromFacets,
  buildCatalogBrowseOptions,
  colorOptionsFromFacets,
  filtersEqual,
  genderFacetHasData,
  hasApparelSizes,
  newArrivalCutoffMs,
  parseShopFilterState,
  resolveShopTab,
  shopFiltersToQueryParams,
  sizeOptionsFromFacets,
} from './utils/shop-filters';

interface ShopCatalogSnapshot {
  readonly hits: readonly SearchHit[];
  readonly totalHits: number;
  readonly totalPages: number;
  readonly facets: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

@Component({
  selector: 'app-shop-page',
  host: { class: 'block w-full min-h-[60vh] container-content' },
  imports: [
    MatButtonModule,
    SharedIconModule,
    ShopHeaderComponent,
    ShopFiltersComponent,
    ShopFiltersDrawerComponent,
    ShopGridComponent,
  ],
  templateUrl: './shop.page.html',
})
export class ShopPage {
  /** From route `data.shopCategory` on category shop routes. */
  readonly shopCategory = input<string>();
  /** From route `data.shopSubcategory` (e.g. bags). */
  readonly shopSubcategory = input<string>();

  readonly sort = input<string>();
  readonly category = input<string>();
  readonly brand = input<string>();
  readonly size = input<string>();
  readonly color = input<string>();
  readonly gender = input<string>();
  readonly newArrivals = input<string>();
  readonly onSale = input<string>();
  readonly inStock = input<string>();
  readonly page = input<string>();

  readonly #router = inject(Router);
  readonly #search = inject(SearchService);
  readonly #seo = inject(SeoService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #document = inject(DOCUMENT);

  readonly #hydrated = signal(false);
  readonly #nowMs = signal(Date.now());
  /** Changes once an hour, so the New arrivals query is not rebuilt every minute. */
  readonly #newArrivalCutoffMs = computed(() => newArrivalCutoffMs(this.#nowMs()));
  readonly filtersOpen = signal(false);

  /** Last successful browse result — kept while the resource reloads (anti-flicker). */
  readonly #snapshot = signal<ShopCatalogSnapshot | null>(null);
  /** Tracks shop tab/bags scope so we only clear the snapshot on a real tab change. */
  readonly #tabScopeKey = signal('');

  readonly activeTab = computed(() =>
    resolveShopTab(this.shopCategory(), this.shopSubcategory()),
  );

  readonly forceBags = computed(() => {
    const cat = (this.shopCategory() ?? '').toLowerCase();
    const sub = (this.shopSubcategory() ?? '').toLowerCase();
    return sub === 'bags' || cat === 'bags';
  });

  readonly pageTitle = computed(() => {
    const tab = this.activeTab();
    if (this.forceBags()) return 'Bags';
    if (tab === 'all' && this.filterState().newArrivals) return 'New Arrivals';
    return SHOP_TABS.find((t) => t.id === tab)?.label === 'All'
      ? 'Shop all'
      : (SHOP_TABS.find((t) => t.id === tab)?.label ?? 'Shop');
  });

  readonly filterState = computed(() =>
    parseShopFilterState({
      sort: this.sort(),
      category: this.category(),
      brand: this.brand(),
      size: this.size(),
      color: this.color(),
      gender: this.gender(),
      newArrivals: this.newArrivals(),
      onSale: this.onSale(),
      inStock: this.inStock(),
      page: this.page(),
    }),
  );

  readonly browseParams = computed(() => {
    const filters = this.filterState();
    return buildCatalogBrowseOptions({
      tab: this.activeTab(),
      filters,
      forceBags: this.forceBags(),
      // Read the clock only when the filter is on, so other filters never reload on the hour.
      nowMs: filters.newArrivals ? this.#newArrivalCutoffMs() : undefined,
    });
  });

  readonly resultsResource = resource({
    params: () => {
      if (!this.#search.isConfigured()) return undefined;
      return this.browseParams();
    },
    loader: ({ params }) => this.#search.browseCatalog(params),
    id: 'shop-catalog',
  });

  readonly hits = computed(() => this.#snapshot()?.hits ?? []);

  readonly totalHits = computed(() => {
    const snap = this.#snapshot();
    if (!snap) return null;
    return snap.totalHits;
  });

  readonly totalPages = computed(() => this.#snapshot()?.totalPages ?? 0);

  readonly facets = computed(() => this.#snapshot()?.facets ?? {});

  readonly brands = computed(() =>
    brandOptionsFromFacets(this.facets(), this.filterState().brands),
  );
  readonly sizes = computed(() =>
    sizeOptionsFromFacets(this.facets(), this.filterState().sizes),
  );
  readonly colors = computed(() =>
    colorOptionsFromFacets(this.facets(), this.filterState().colors),
  );
  readonly showGender = computed(() => genderFacetHasData(this.facets()));
  readonly showSizes = computed(() => hasApparelSizes(this.facets()));
  readonly accessoriesSubOnly = computed(
    () => this.activeTab() === 'accessories' && !this.forceBags(),
  );

  readonly isConfigured = computed(() => this.#search.isConfigured());

  /** First paint only — never swap the grid for skeletons on filter refreshes. */
  readonly isLoading = computed(
    () =>
      this.isConfigured() &&
      !this.resultsResource.error() &&
      this.#snapshot() === null &&
      this.resultsResource.isLoading(),
  );

  readonly isRefreshing = computed(
    () => this.#snapshot() !== null && this.resultsResource.isLoading(),
  );

  readonly showEmpty = computed(
    () =>
      this.isConfigured() &&
      this.#snapshot() !== null &&
      this.hits().length === 0 &&
      !this.resultsResource.isLoading(),
  );

  readonly #desktop = signal(false);

  constructor() {
    this.#preconnectAlgolia();
    if (isPlatformBrowser(this.#platformId)) {
      this.#search.warm();
    }

    effect(() => {
      if (!this.resultsResource.hasValue()) return;
      const value = this.resultsResource.value();
      if (!value) return;
      this.#snapshot.set({
        hits: value.hits,
        totalHits: value.totalHits,
        totalPages: value.totalPages,
        facets: value.facets ?? {},
      });
    });

    // Clear the stale snapshot only when the shop tab/bags scope actually changes.
    effect(() => {
      const key = `${this.activeTab()}|${this.forceBags() ? 'bags' : ''}`;
      const prev = this.#tabScopeKey();
      if (prev !== '' && prev !== key) {
        this.#snapshot.set(null);
      }
      this.#tabScopeKey.set(key);
    });

    effect(() => {
      const title = this.pageTitle();
      this.#seo.setPageMetadata({
        title: `${title} | Atteya Store`,
        description: `Shop ${title.toLowerCase()} at Atteya Store — padel rackets, apparel, bags, and accessories.`,
      });
    });

    afterNextRender(() => {
      this.#hydrated.set(true);
      this.#nowMs.set(Date.now());
      const id = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));

      const mq = this.#document.defaultView?.matchMedia('(min-width: 768px)');
      if (mq) {
        this.#desktop.set(mq.matches);
        const onChange = () => this.#desktop.set(mq.matches);
        mq.addEventListener('change', onChange);
        this.#destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
      }
    });
  }

  isDesktopLayout(): boolean {
    return this.#desktop();
  }

  hydrated(): boolean {
    return this.#hydrated();
  }

  nowMs(): number {
    return this.#nowMs();
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  closeMobileFilters(): void {
    this.filtersOpen.set(false);
  }

  onFiltersChange(next: ShopFilterState): void {
    if (filtersEqual(next, this.filterState())) return;
    void this.#navigate(next);
  }

  clearFilters(): void {
    void this.#navigate({ ...DEFAULT_SHOP_FILTERS, sort: this.filterState().sort });
  }

  goToPage(nextPage: number): void {
    if (nextPage < 0 || nextPage >= this.totalPages()) return;
    void this.#navigate({ ...this.filterState(), page: nextPage }, false);
  }

  #preconnectAlgolia(): void {
    const href = this.#search.preconnectOrigin();
    const head = this.#document.head;
    if (!href || !head) return;
    if (head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = this.#document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.setAttribute('crossorigin', '');
    head.appendChild(link);
  }

  /**
   * @param preserveScroll When true (default), skip router scroll restoration so
   * filter tweaks do not jump the viewport to the top.
   */
  async #navigate(state: ShopFilterState, preserveScroll = true): Promise<void> {
    const tab = this.activeTab();
    const path =
      this.forceBags()
        ? '/category/accessories/bags'
        : (SHOP_TABS.find((t) => t.id === tab)?.path ?? '/shop');

    await this.#router.navigate([path], {
      queryParams: shopFiltersToQueryParams(state),
      queryParamsHandling: 'merge',
      replaceUrl: true,
      ...(preserveScroll ? { scroll: 'manual' as const } : {}),
    });
  }
}
