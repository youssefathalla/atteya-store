import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  PLATFORM_ID,
  resource,
  signal,
  TransferState,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import {
  NEW_ARRIVALS_LIMIT,
  ProductCacheService,
  ProductService,
} from '@core/services/products';
import type { Product } from '@core/services/products/product.model';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import { productToCardData } from '@shared/components/product-card/product-card.utils';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { newArrivalDaysLeft } from '@core/services/products/utils/new-arrival';
import { listingCardPrices } from '../../utils/listing-card-prices';
import { rowScrollProgress } from '../../utils/row-scroll';
import { RowScrollLockDirective } from '../../directives/row-scroll-lock.directive';
import {
  HOME_NEW_ARRIVALS_ROW_KEY,
  putHomeRowSeed,
  takeHomeRowSeed,
} from '../../utils/home-row-products.state';
import { RowScrollNavComponent } from '../row-scroll-nav/row-scroll-nav.component';

@Component({
  selector: 'app-new-arrivals-section',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    SharedIconModule,
    ProductCardComponent,
    HorizontalScrollDirective,
    RowScrollLockDirective,
    SkeletonComponent,
    RowScrollNavComponent,
  ],
  templateUrl: './new-arrivals-section.component.html',
})
export class NewArrivalsSectionComponent {
  readonly #products = inject(ProductService);
  readonly #cache = inject(ProductCacheService);
  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);
  readonly #transfer = inject(TransferState);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);
  readonly isBrowser = isPlatformBrowser(this.#platformId);

  readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scrollRow');
  readonly skeletonSlots = [0, 1, 2, 3] as const;

  readonly progress = signal(0);
  readonly canPrev = signal(false);
  readonly canNext = signal(false);
  readonly #hydrated = signal(false);
  readonly #nowMs = signal(Date.now());

  /** SSR TransferState seed — keeps cards visible across hydrate (no skeleton flash). */
  readonly #seeded = signal(
    takeHomeRowSeed(this.#transfer, HOME_NEW_ARRIVALS_ROW_KEY, this.isBrowser),
  );

  readonly #list = resource({
    loader: async () => {
      const products = await this.#products.listNewArrivals(NEW_ARRIVALS_LIMIT);
      putHomeRowSeed(this.#transfer, HOME_NEW_ARRIVALS_ROW_KEY, products, this.isBrowser);
      return products;
    },
  });

  readonly #siblings = resource({
    params: () => {
      const products = this.products();
      const groups = products
        .map((product) => product.modelGroup?.trim() ?? '')
        .filter((group) => group.length > 0);
      return groups.length > 0 ? groups : undefined;
    },
    loader: async ({ params }) => {
      const map = await this.#products.listPublishedByModelGroups(params, 12);
      const all: Product[] = [];
      for (const list of map.values()) all.push(...list);
      this.#cache.seed(all);
      return map;
    },
  });

  readonly products = computed(() => {
    if (this.#list.hasValue()) return this.#list.value() ?? [];
    return this.#seeded() ?? [];
  });

  readonly isLoading = computed(() => {
    if (this.#seeded() !== undefined) return false;
    if (this.#list.hasValue() || this.#list.error()) return false;
    return true;
  });

  /**
   * Where the "New arrivals" title goes. The row puts products staff marked as new arrivals
   * first and tops up with the newest products, while the Shop New arrivals filter only shows
   * marked ones. So: any marked product in the row → that filter; only the top-up → Shop sorted
   * newest, so the shopper never lands on an empty list.
   */
  readonly titleQueryParams = computed<Record<string, string>>(() => {
    const now = this.#nowMs();
    const anyMarked = this.products().some(
      (product) => newArrivalDaysLeft(product.newArrivalUntil, now) !== null,
    );
    const params: Record<string, string> = anyMarked ? { newArrivals: '1' } : { sort: 'newest' };
    return params;
  });

  /** Hide heading + padding when empty/failed after load. */
  readonly showSection = computed(() => this.isLoading() || this.products().length > 0);

  readonly cards = computed(() => {
    const products = this.products();
    const live = this.#offers.ready() && !this.#offers.failed();
    const prices = listingCardPrices(products, live ? this.#offers.all() : [], {
      live,
      now: new Date(this.#nowMs()),
      signedIn: this.#hydrated() && Boolean(this.#auth.user()),
    });
    const siblings = this.#siblings.hasValue() ? this.#siblings.value() : new Map();
    return products.flatMap((product) => {
      const price = prices.get(product.id);
      if (!price) return [];
      return [productToCardData(product, price, siblings)];
    });
  });

  constructor() {
    afterNextRender(() => {
      this.#hydrated.set(true);
      this.#nowMs.set(Date.now());
      const id = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));
    });

    afterRenderEffect((onCleanup) => {
      if (!this.isBrowser) return;
      const el = this.scrollEl()?.nativeElement;
      if (!el) return;

      const sync = () => {
        const state = rowScrollProgress(el);
        this.progress.set(state.progress);
        this.canPrev.set(state.canPrev);
        this.canNext.set(state.canNext);
      };
      sync();
      el.addEventListener('scroll', sync, { passive: true });
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
      ro?.observe(el);
      onCleanup(() => {
        el.removeEventListener('scroll', sync);
        ro?.disconnect();
      });
    });
  }
}
