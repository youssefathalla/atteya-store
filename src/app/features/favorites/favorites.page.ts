import {
  Component,
  computed,
  inject,
  OnInit,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '@core/services/auth/auth.service';
import { displayPrice } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { OffersService } from '@core/services/offers/offers.service';
import { FavoritesService } from '@core/services/favorites';
import { ProductService, type Product } from '@core/services/products';
import { SeoService } from '@core/services/seo';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import type { ProductCardPrice } from '@shared/components/product-card/product-card.model';
import { productToCardData } from '@shared/components/product-card/product-card.utils';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

@Component({
  selector: 'app-favorites-page',
  host: { class: 'block w-full min-h-[60vh] container-content' },
  imports: [
    RouterLink,
    MatButtonModule,
    ProductCardComponent,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './favorites.page.html',
})
export class FavoritesPageComponent implements OnInit {
  readonly #favorites = inject(FavoritesService);
  readonly #products = inject(ProductService);
  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);
  readonly #seo = inject(SeoService);

  readonly skeletonSlots = [0, 1, 2, 3, 4, 5] as const;

  readonly favoritesReady = this.#favorites.ready;

  readonly productsResource = resource({
    params: () => {
      if (!this.#favorites.ready()) return undefined;
      return this.#favorites.items().map((item) => ({
        productId: item.productId,
        slug: item.slug,
      }));
    },
    loader: async ({ params }) => {
      if (params.length === 0) return [] as readonly Product[];
      const loaded = await Promise.all(
        params.map((item) => this.#products.getBySlug(item.slug)),
      );
      const bySlug = new Map<string, Product>();
      for (const product of loaded) {
        if (product) bySlug.set(product.slug, product);
      }
      // Keep favorite order (newest first from the service). Drop unpublished/missing.
      return params.flatMap((item) => {
        const product = bySlug.get(item.slug);
        return product ? [product] : [];
      });
    },
  });

  readonly #siblingsResource = resource({
    params: () => {
      if (!this.productsResource.hasValue()) return undefined;
      const groups = this.productsResource
        .value()
        .map((product) => product.modelGroup?.trim() ?? '')
        .filter((group) => group.length > 0);
      return groups.length > 0 ? groups : undefined;
    },
    loader: ({ params }) => this.#products.listPublishedByModelGroups(params, 12),
  });

  readonly cards = computed(() => {
    if (!this.productsResource.hasValue()) return [];
    const products = this.productsResource.value();
    const siblings = this.#siblingsResource.hasValue()
      ? this.#siblingsResource.value()
      : new Map<string, readonly Product[]>();
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : [];
    const ctx = {
      now: new Date(),
      signedIn: Boolean(this.#auth.user()),
    };

    return products.map((product) => {
      const price = priceFor(product, liveMode, offers, ctx);
      return productToCardData(product, price, siblings);
    });
  });

  readonly showLoading = computed(
    () => !this.favoritesReady() || (!this.productsResource.hasValue() && !this.productsResource.error()),
  );

  readonly showEmpty = computed(
    () =>
      this.favoritesReady() &&
      this.productsResource.hasValue() &&
      this.cards().length === 0,
  );

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Favorites | Atteya Store',
      description: 'Products you saved as favorites at Atteya Store.',
    });
  }
}

function priceFor(
  product: Product,
  liveMode: boolean,
  offers: Parameters<typeof displayPrice>[1],
  ctx: Parameters<typeof displayPrice>[2],
): ProductCardPrice {
  if (liveMode) {
    const d = displayPrice(toPricedProduct(product), offers, ctx);
    return {
      price: d.partial ? product.price : d.fromPrice,
      fromPrice: d.partial ? d.fromPrice : null,
      listPrice: d.listPrice,
      partial: d.partial,
      badges: [],
    };
  }
  const list = product.compareAtPrice;
  const onSale = list !== null && list > product.price;
  return {
    price: product.price,
    fromPrice: null,
    listPrice: onSale ? list : null,
    partial: false,
    badges: [],
  };
}
