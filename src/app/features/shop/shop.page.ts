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
import { displayDecimals, toDisplayAmount, type Offer } from '@core/services/offers/engine';
import { offerShopSubtitle, offerTitleVisible } from '@core/services/offers/offer-shop';
import { CurrencyService } from '@core/services/currency/currency.service';
import { CatalogService } from '@core/services/products/catalog.service';
import { ShopCategoriesService } from '@core/services/products/shop-categories.service';
import { sameShareImage, shareImageFor, type ShareImage } from '@core/services/products/utils/share-image';
import {
  shopCategoryFilterIds,
  shopCategoryOptionsFrom,
  shopTabFor,
  shopTabsFrom,
  withChosenCategories,
} from '@core/services/products/utils/shop-categories';
import { OffersService } from '@core/services/offers/offers.service';
import { PlayerListService } from '@core/services/products/player-list.service';
import { SeoService } from '@core/services/seo';
import { SearchService, type SearchHit } from '@core/services/search';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { formatMoney } from '@shared/utils/money';
import { ShopFiltersDrawerComponent } from './components/shop-filters-drawer/shop-filters-drawer.component';
import { ShopFiltersComponent } from './components/shop-filters/shop-filters.component';
import { ShopGridComponent } from './components/shop-grid/shop-grid.component';
import { ShopHeaderComponent } from './components/shop-header/shop-header.component';
import { DEFAULT_SHOP_FILTERS, type ShopFilterState } from './models/shop.model';
import {
  brandOptionsFromFacets,
  buildCatalogBrowseOptions,
  colorOptionsFromFacets,
  filtersEqual,
  genderFacetHasData,
  hasApparelSizes,
  newArrivalCutoffMs,
  parseOfferParam,
  parseShopFilterState,
  playerOptionsFromFacets,
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
  /** From route `data.shopCategory` (the Bags page sets `accessories`). */
  readonly shopCategory = input<string>();
  /** `/category/:slug`: a top-level category (the route only matches those, `shopCategoryMatch`). */
  readonly slug = input<string>();
  /** Route `data.categoryShop`, set only on `/category/:slug`, so `/shop?slug=…` changes nothing. */
  readonly categoryShop = input<boolean>(false);
  /** From route `data.shopSubcategory` (e.g. bags). */
  readonly shopSubcategory = input<string>();

  readonly sort = input<string>();
  readonly category = input<string>();
  readonly brand = input<string>();
  readonly player = input<string>();
  readonly size = input<string>();
  readonly color = input<string>();
  readonly gender = input<string>();
  readonly newArrivals = input<string>();
  readonly onSale = input<string>();
  readonly inStock = input<string>();
  readonly page = input<string>();
  /** `?offer=<id>`: only the products in that offer (the bag's Shop the Offer link). */
  readonly offer = input<string>();

  readonly #router = inject(Router);
  readonly #search = inject(SearchService);
  readonly #seo = inject(SeoService);
  readonly #playerList = inject(PlayerListService);
  readonly #offers = inject(OffersService);
  readonly #currency = inject(CurrencyService);
  readonly #shopCategories = inject(ShopCategoriesService);
  readonly #catalog = inject(CatalogService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #document = inject(DOCUMENT);
  readonly #isBrowser = isPlatformBrowser(this.#platformId);

  readonly #hydrated = signal(false);
  readonly #nowMs = signal(Date.now());
  /** Changes once an hour, so the New arrivals query is not rebuilt every minute. */
  readonly #newArrivalCutoffMs = computed(() => newArrivalCutoffMs(this.#nowMs()));
  readonly filtersOpen = signal(false);

  /** Last successful browse result — kept while the resource reloads (anti-flicker). */
  readonly #snapshot = signal<ShopCatalogSnapshot | null>(null);
  /** Tracks shop tab/bags scope so we only clear the snapshot on a real tab change. */
  readonly #tabScopeKey = signal('');

  /** Published product counts per category, or null while unknown (then nothing is left out). */
  readonly #categoryCounts = computed(() => this.#catalog.summary()?.categories ?? null);

  /** All + every shown top-level category (server seed first, then the live list). */
  readonly tabs = computed(() => shopTabsFrom(this.#shopCategories.categories(), this.#categoryCounts()));

  readonly categoryOptions = computed(() =>
    withChosenCategories(
      shopCategoryOptionsFrom(this.#shopCategories.categories(), this.#categoryCounts()),
      this.filterState().categories,
      this.#shopCategories.categories(),
    ),
  );

  /** Ids `?category=` may name. Compared by content, so a new counts snapshot sends no new search. */
  readonly #categoryFilterIds = computed(() => shopCategoryFilterIds(this.#shopCategories.categories()), {
    equal: sameSet,
  });

  readonly activeTab = computed(() =>
    resolveShopTab(
      this.shopCategory() ?? (this.categoryShop() ? this.slug() : undefined),
      this.shopSubcategory(),
      this.#shopCategories.categories(),
    ),
  );

  readonly forceBags = computed(() => {
    const cat = (this.shopCategory() ?? '').toLowerCase();
    const sub = (this.shopSubcategory() ?? '').toLowerCase();
    return sub === 'bags' || cat === 'bags';
  });

  /**
   * Share-preview picture (ATS-263): on a category's Shop page (`/category/:slug`, the Bags page),
   * that category's photo from the server-seeded `shop-categories` list; none on `/shop`.
   */
  readonly #shareImage = computed(
    (): ShareImage | null =>
      shareImageFor(
        this.#shopCategories.categories(),
        this.shopSubcategory() || (this.categoryShop() ? this.slug() : null),
      ),
    { equal: sameShareImage },
  );

  /** The player's name when exactly one player is chosen in the Player filter. */
  readonly #playerName = computed(() => {
    const chosen = this.filterState().players;
    return chosen.length === 1 ? this.#playerList.nameOf(chosen[0]!) : null;
  });

  readonly #offerId = computed(() => parseOfferParam(this.offer()));

  /**
   * The offer the page is filtered to. `undefined` while offers are still loading (always on the
   * server, which has no offers listener), `null` once they are loaded and the offer is not live.
   */
  readonly #offer = computed((): Offer | null | undefined => {
    const id = this.#offerId();
    if (!id) return null;
    // The server has no offers listener (its list is always empty), so it renders "loading".
    if (!this.#isBrowser || !this.#offers.ready()) return undefined;
    return this.#offers.live().find((offer) => offer.id === id) ?? null;
  });

  /** The offer has ended (or never existed): the page lists the whole store instead. */
  readonly offerEnded = computed(() => this.#offerId() !== null && this.#offer() === null);

  /**
   * The offer whose title the heading may show. A Free shipping offer abroad is left out: the page
   * still lists its products, under the normal Shop title (Free shipping is for Egypt orders only).
   */
  readonly #titledOffer = computed((): Offer | null | undefined => {
    const offer = this.#offer();
    return offer && !offerTitleVisible(offer, this.#currency.visitorCountry()) ? null : offer;
  });

  readonly pageSubtitle = computed(() => {
    const offer = this.#titledOffer();
    if (offer) {
      // Bundle rows in the visitor's currency ("2 for EGP 200 · 3 for EGP 275").
      const entry = this.#currency.entry();
      const decimals = displayDecimals(entry.code);
      return offerShopSubtitle(offer, (egp) =>
        formatMoney(toDisplayAmount(egp, entry), entry.code, decimals),
      );
    }
    return this.offerEnded() ? 'This offer has ended. Here is everything else in the store.' : null;
  });

  readonly pageTitle = computed(() => {
    const offer = this.#titledOffer();
    if (offer) return offer.title;
    // Offers still loading: the header shows a placeholder instead of a title that would change.
    if (offer === undefined) return '';
    const tab = this.activeTab();
    const playerName = this.#playerName();
    if (playerName) return playerName;
    if (this.forceBags()) return 'Bags';
    if (tab === 'all' && this.filterState().newArrivals) return 'New Arrivals';
    if (tab === 'all') return 'Shop All';
    return shopTabFor(tab, this.#shopCategories.categories()).label;
  });

  readonly filterState = computed(
    () =>
      parseShopFilterState({
        sort: this.sort(),
        category: this.category(),
        brand: this.brand(),
        player: this.player(),
        size: this.size(),
        color: this.color(),
        gender: this.gender(),
        newArrivals: this.newArrivals(),
        onSale: this.onSale(),
        inStock: this.inStock(),
        page: this.page(),
        categoryIds: this.#categoryFilterIds(),
      }),
    { equal: filtersEqual },
  );

  readonly browseParams = computed(() => {
    const filters = this.filterState();
    return buildCatalogBrowseOptions({
      tab: this.activeTab(),
      filters,
      forceBags: this.forceBags(),
      // Read the clock only when the filter is on, so other filters never reload on the hour.
      nowMs: filters.newArrivals ? this.#newArrivalCutoffMs() : undefined,
      // Kept while offers load, so the server render and the first browser render ask the same.
      offerId: this.offerEnded() ? null : this.#offerId(),
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

  readonly brands = computed(() => brandOptionsFromFacets(this.facets(), this.filterState().brands));
  readonly players = computed(() =>
    playerOptionsFromFacets(this.facets(), this.#playerList.players(), this.filterState().players),
  );
  readonly sizes = computed(() => sizeOptionsFromFacets(this.facets(), this.filterState().sizes));
  readonly colors = computed(() => colorOptionsFromFacets(this.facets(), this.filterState().colors));
  readonly showGender = computed(() => genderFacetHasData(this.facets()));
  readonly showSizes = computed(() => hasApparelSizes(this.facets()));
  readonly accessoriesSubOnly = computed(() => this.activeTab() === 'accessories' && !this.forceBags());

  readonly isConfigured = computed(() => this.#search.isConfigured());

  /** First paint only — never swap the grid for skeletons on filter refreshes. */
  readonly isLoading = computed(
    () =>
      this.isConfigured() &&
      !this.resultsResource.error() &&
      this.#snapshot() === null &&
      this.resultsResource.isLoading(),
  );

  readonly isRefreshing = computed(() => this.#snapshot() !== null && this.resultsResource.isLoading());

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
      const title = this.pageTitle() || 'Offer';
      const playerName = this.#playerName();
      const image = this.#shareImage();
      this.#seo.setPageMetadata({
        image: image?.path ?? null,
        imageAlt: image?.alt ?? null,
        title: `${title} | Atteya Store`,
        description: playerName
          ? `Shop ${playerName}'s padel gear at Atteya Store — rackets, apparel, bags, and accessories.`
          : `Shop ${title.toLowerCase()} at Atteya Store — padel rackets, apparel, bags, and accessories.`,
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
    const path = this.forceBags()
      ? '/category/accessories/bags'
      : shopTabFor(tab, this.#shopCategories.categories()).path;

    await this.#router.navigate([path], {
      queryParams: shopFiltersToQueryParams(state),
      queryParamsHandling: 'merge',
      replaceUrl: true,
      ...(preserveScroll ? { scroll: 'manual' as const } : {}),
    });
  }
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}
