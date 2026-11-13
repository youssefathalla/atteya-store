import { Component, computed, inject, linkedSignal, OnInit, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import { FavoritesService } from '@core/services/favorites';
import { ProductService, type Product } from '@core/services/products';
import { SeoService } from '@core/services/seo';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import { productCardPrice, productToCardData } from '@shared/components/product-card/product-card.utils';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

@Component({
  selector: 'app-favorites-page',
  host: { class: 'block w-full min-h-[60vh] container-content' },
  imports: [RouterLink, MatButtonModule, ProductCardComponent, SharedIconModule, SkeletonComponent],
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

  /**
   * Read by product id, never by the slug saved on the favorite: a product's web address can
   * change (ATS-115), its id never does. The saved `slug` is only a leftover hint.
   */
  readonly productsResource = resource({
    params: () => {
      if (!this.#favorites.ready()) return undefined;
      return this.#favorites.items().map((item) => item.productId);
    },
    loader: async ({ params }) => {
      if (params.length === 0) return [] as readonly Product[];
      const loaded = await Promise.all(params.map((id) => this.#products.getById(id)));
      // Keep favorite order (newest first from the service). Drop unpublished/missing
      // (an admin can read unpublished products, so check the flag too).
      return loaded.filter((product): product is Product => product !== null && product.published);
    },
  });

  /**
   * The last list that finished loading. The resource drops its value while it reloads for a new
   * list of ids (after a heart is removed), so this keeps the other cards on screen instead of
   * flashing skeletons. Skeletons show only before the first list arrives.
   */
  readonly #shownProducts = linkedSignal<
    { ready: boolean; products: readonly Product[] | undefined },
    readonly Product[] | undefined
  >({
    source: () => ({
      ready: this.#favorites.ready(),
      products: this.productsResource.hasValue() ? this.productsResource.value() : undefined,
    }),
    computation: (next, previous) => (next.ready ? (next.products ?? previous?.value) : undefined),
  });

  readonly cards = computed(() => {
    const shown = this.#shownProducts();
    if (!shown) return [];
    // A heart just removed leaves the page at once, even while the list is still reloading.
    const saved = new Set(this.#favorites.items().map((item) => item.productId));
    const products = shown.filter((product) => saved.has(product.id));
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : [];
    const ctx = {
      now: this.#offers.now(),
      signedIn: this.#auth.offerSignedIn(),
    };

    return products.map((product) => {
      const price = productCardPrice(product, liveMode ? offers : null, ctx);
      return productToCardData(product, price);
    });
  });

  readonly showLoading = computed(
    () => !this.favoritesReady() || (this.#shownProducts() === undefined && !this.productsResource.error()),
  );

  readonly showEmpty = computed(
    () => this.favoritesReady() && this.#shownProducts() !== undefined && this.cards().length === 0,
  );

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Favorites | Atteya Store',
      description: 'Products you saved as favorites at Atteya Store.',
      noindex: true,
    });
  }
}
