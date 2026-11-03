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
import { SearchService } from '@core/services/search';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ShopFiltersDrawerComponent } from './components/shop-filters-drawer/shop-filters-drawer.component';
import { ShopFiltersComponent } from './components/shop-filters/shop-filters.component';
import { ShopGridComponent } from './components/shop-grid/shop-grid.component';
import { ShopHeaderComponent } from './components/shop-header/shop-header.component';
import { DEFAULT_SHOP_FILTERS, SHOP_TABS, type ShopFilterState } from './models/shop.model';
import {
  brandOptionsFromFacets,
  buildCatalogBrowseOptions,
  colorOptionsFromFacets,
  filtersEqual,
  genderFacetHasData,
  hasApparelSizes,
  parseShopFilterState,
  resolveShopTab,
  shopFiltersToQueryParams,
  sizeOptionsFromFacets,
} from './utils/shop-filters';

const DEFAULT_PRICE_BOUNDS = { min: 99, max: 19_499 } as const;

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
  readonly priceMin = input<string>();
  readonly priceMax = input<string>();
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
  readonly filtersOpen = signal(false);

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
      priceMin: this.priceMin(),
      priceMax: this.priceMax(),
      onSale: this.onSale(),
      inStock: this.inStock(),
      page: this.page(),
    }),
  );

  readonly browseParams = computed(() =>
    buildCatalogBrowseOptions({
      tab: this.activeTab(),
      filters: this.filterState(),
      forceBags: this.forceBags(),
    }),
  );

  readonly resultsResource = resource({
    params: () => {
      if (!this.#search.isConfigured()) return undefined;
      return this.browseParams();
    },
    loader: ({ params }) => this.#search.browseCatalog(params),
    id: 'shop-catalog',
  });

  readonly hits = computed(() => {
    if (this.resultsResource.error() || !this.resultsResource.hasValue()) return [];
    return this.resultsResource.value()?.hits ?? [];
  });

  readonly totalHits = computed(() => {
    if (this.resultsResource.error() || !this.resultsResource.hasValue()) return null;
    return this.resultsResource.value()?.totalHits ?? 0;
  });

  readonly totalPages = computed(() => {
    if (this.resultsResource.error() || !this.resultsResource.hasValue()) return 0;
    return this.resultsResource.value()?.totalPages ?? 0;
  });

  readonly facets = computed(
    () => this.resultsResource.value()?.facets ?? {},
  );

  readonly brands = computed(() => brandOptionsFromFacets(this.facets()));
  readonly sizes = computed(() => sizeOptionsFromFacets(this.facets()));
  readonly colors = computed(() =>
    colorOptionsFromFacets(this.facets(), this.filterState().colors),
  );
  readonly showGender = computed(() => genderFacetHasData(this.facets()));
  readonly showSizes = computed(() => hasApparelSizes(this.facets()));
  readonly accessoriesSubOnly = computed(
    () => this.activeTab() === 'accessories' && !this.forceBags(),
  );

  readonly priceBounds = computed(() => {
    const stats = this.resultsResource.value()?.facetStats?.['price'];
    if (!stats) return DEFAULT_PRICE_BOUNDS;
    return {
      min: Number.isFinite(stats.min) ? Math.floor(stats.min) : DEFAULT_PRICE_BOUNDS.min,
      max: Number.isFinite(stats.max) ? Math.ceil(stats.max) : DEFAULT_PRICE_BOUNDS.max,
    };
  });

  readonly isConfigured = computed(() => this.#search.isConfigured());
  readonly isLoading = computed(
    () =>
      this.isConfigured() &&
      !this.resultsResource.error() &&
      !this.resultsResource.hasValue(),
  );
  readonly showEmpty = computed(
    () =>
      this.isConfigured() &&
      this.resultsResource.hasValue() &&
      this.hits().length === 0,
  );

  readonly #desktop = signal(false);

  constructor() {
    this.#preconnectAlgolia();
    if (isPlatformBrowser(this.#platformId)) {
      this.#search.warm();
    }

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
    void this.#navigate({ ...this.filterState(), page: nextPage });
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

  async #navigate(state: ShopFilterState): Promise<void> {
    const tab = this.activeTab();
    const path =
      this.forceBags()
        ? '/category/accessories/bags'
        : (SHOP_TABS.find((t) => t.id === tab)?.path ?? '/shop');

    await this.#router.navigate([path], {
      queryParams: shopFiltersToQueryParams(state),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
