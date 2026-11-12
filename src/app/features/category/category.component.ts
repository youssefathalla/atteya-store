import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { isOutsideAddress } from '@core/services/navigation/nav-target';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import { NavService } from '@core/services/navigation';
import { CatalogService } from '@core/services/products/catalog.service';
import { ProductService } from '@core/services/products/product.service';
import { onePerModel } from '@core/services/products/utils/one-per-model';
import { SeoService } from '@core/services/seo';
import { listingCardPrices } from '@shared/components/product-card/listing-card-prices';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  CatalogProductGridComponent,
  type CatalogCardPrice,
} from './components/catalog-product-grid/catalog-product-grid.component';
import { LoaderComponent } from '@shared/ui/loader/loader.component';
import { resolveCatalogListParams, toProductListQuery } from './utils/catalog-list-query';

const PAGE_SIZE = 48;

@Component({
  selector: 'app-category',
  imports: [
    RouterLink,
    LinkTargetPipe,
    MatButtonModule,
    SharedIconModule,
    CatalogProductGridComponent,
    LoaderComponent,
  ],
  templateUrl: './category.component.html',
  host: {
    class: 'block w-full min-h-[60vh] container-content',
  },
})
export class CategoryComponent {
  /** An Outside Link (ATS-267) is no category page, so the pills leave it out (the menus show it). */
  readonly isOutside = isOutsideAddress;

  readonly slug = input.required<string>();
  readonly subSlug = input<string>();
  readonly isBrand = input<boolean>(false);

  readonly #navService = inject(NavService);
  readonly #catalogService = inject(CatalogService);
  readonly #productService = inject(ProductService);
  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);
  readonly #seoService = inject(SeoService);
  readonly #destroyRef = inject(DestroyRef);

  readonly #hydrated = signal(false);
  readonly #nowMs = signal(Date.now());

  constructor() {
    effect(() => {
      const title = this.displayTitle();
      const isBrand = this.isBrand();
      this.#seoService.setPageMetadata({
        title: `${title} | Atteya Store`,
        description: isBrand
          ? `Discover official tournament equipment and performance gear from ${title} at Atteya Store.`
          : `Discover our curated collection of tournament-grade ${title.toLowerCase()} designed for elite padel and tennis players.`,
      });
    });

    afterNextRender(() => {
      this.#hydrated.set(true);
      this.#nowMs.set(Date.now());
      const id = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));
    });
  }

  readonly matchedBrand = computed(() => {
    if (!this.isBrand()) return null;
    const s = this.slug().toLowerCase();
    const categories = this.#navService.expandedCategories();

    for (const cat of categories) {
      if (!cat.megaMenu) continue;
      for (const col of cat.megaMenu) {
        const link = col.links.find(
          (l) => l.path.toLowerCase() === `/brand/${s}` || l.label.toLowerCase() === s,
        );
        if (link) return link;
      }
    }
    return null;
  });

  readonly category = computed(() => {
    if (this.isBrand()) return null;
    const s = this.slug().toLowerCase();
    return (
      this.#navService
        .expandedCategories()
        .find((c) => c.id.toLowerCase() === s || c.path?.toLowerCase() === `/category/${s}`) ?? null
    );
  });

  readonly catalogCategory = computed(() => {
    if (this.isBrand()) return null;
    const targetSlug = (this.subSlug() || this.slug()).toLowerCase();
    return this.#catalogService.categoryBySlug(targetSlug);
  });

  readonly catalogBrand = computed(() => {
    if (!this.isBrand()) return null;
    return this.#catalogService.brandBySlug(this.slug());
  });

  readonly listParams = computed(() =>
    resolveCatalogListParams({
      isBrand: this.isBrand(),
      slug: this.slug(),
      subSlug: this.subSlug(),
      categoryId: this.catalogCategory()?.id ?? null,
      brandId: this.catalogBrand()?.id ?? null,
    }),
  );

  readonly productsResource = resource({
    params: () => toProductListQuery(this.listParams(), PAGE_SIZE),
    loader: ({ params }) => {
      if (!params) return Promise.resolve([]);
      return this.#productService.listPublished(params);
    },
  });

  readonly products = computed(() => {
    if (this.productsResource.error() || !this.productsResource.hasValue()) return [];
    // One card per model: other colours are under each card's photo.
    return onePerModel(this.productsResource.value() ?? []);
  });

  readonly cardPrices = computed<ReadonlyMap<string, CatalogCardPrice>>(() => {
    const live = this.#offers.ready() && !this.#offers.failed();
    return listingCardPrices(this.products(), live ? this.#offers.all() : [], {
      live,
      now: new Date(this.#nowMs()),
      signedIn: this.#hydrated() && this.#auth.offerSignedIn(),
    });
  });

  readonly catalogListCount = computed((): number | null => {
    const summary = this.#catalogService.summary();
    if (!summary) return null;
    const params = this.listParams();
    if (params.kind === 'unsupported') return 0;
    if (params.kind === 'all') return summary.total;
    if (params.kind === 'category' && params.filterId) {
      const id = params.filterId;
      return summary.categories[id] ?? summary.categories[id.toLowerCase()] ?? 0;
    }
    if (params.kind === 'brand' && params.filterId) {
      const id = params.filterId;
      return summary.brands[id] ?? summary.brands[id.toLowerCase()] ?? 0;
    }
    return null;
  });

  readonly isLoading = computed(() => {
    if (this.listParams().kind === 'unsupported') return false;
    if (this.productsResource.error()) return false;
    if (this.productsResource.hasValue()) return false;
    if (this.catalogListCount() === 0) return false;
    return true;
  });

  readonly showEmpty = computed(() => {
    if (this.listParams().kind === 'unsupported') return true;
    if (this.productsResource.error()) return false;
    if (this.productsResource.hasValue()) {
      return this.products().length === 0;
    }
    return this.catalogListCount() === 0;
  });

  readonly displayTitle = computed(() => {
    if (this.isBrand()) {
      const catalogBrand = this.catalogBrand();
      if (catalogBrand) return catalogBrand.name;
      return this.matchedBrand()?.label || this.slug().replaceAll('-', ' ');
    }

    const fromCatalog = this.catalogCategory();
    if (fromCatalog) return fromCatalog.name;

    const sub = this.subSlug();
    if (sub) {
      const cat = this.category();
      if (cat?.megaMenu) {
        for (const col of cat.megaMenu) {
          const match = col.links.find((l) => l.path.toLowerCase().endsWith(`/${sub.toLowerCase()}`));
          if (match) return match.label;
        }
      }
      return sub.replaceAll('-', ' ');
    }

    if (this.slug().toLowerCase() === 'all') return 'All products';
    if (this.slug().toLowerCase() === 'sale') return 'Sale';
    return this.category()?.label || this.slug().replaceAll('-', ' ');
  });

  readonly currentRoutePath = computed(() => {
    if (this.isBrand()) return `/brand/${this.slug()}`;
    const sub = this.subSlug();
    if (sub) return `/category/${this.slug()}/${sub}`;
    return `/category/${this.slug()}`;
  });

  readonly emptyMessage = computed(() => {
    if (this.isBrand()) {
      return 'No products from this brand are available right now.';
    }
    if (this.slug().toLowerCase() === 'sale') {
      return 'No sale items are listed yet. Check back soon or browse the full catalogue.';
    }
    return 'No products in this category yet. Try another category or search.';
  });
}
