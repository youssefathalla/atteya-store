import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import type { Product } from '@core/services/products/product.model';
import { ProductCacheService, ProductService } from '@core/services/products';
import type { SearchHit } from '@core/services/search';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import type {
  ProductCardPrice,
  ProductCardSibling,
} from '@shared/components/product-card/product-card.model';
import {
  searchHitCardPrice,
  searchHitToCardData,
  siblingGroupsMap,
  toSiblingGroupsRecord,
  uniqueModelGroups,
} from '@shared/components/product-card/product-card.utils';
import { SkeletonComponent } from '@shared/ui/skeleton';

@Component({
  selector: 'app-shop-grid',
  host: { class: 'block w-full' },
  imports: [ProductCardComponent, SkeletonComponent],
  templateUrl: './shop-grid.component.html',
})
export class ShopGridComponent {
  readonly hits = input.required<readonly SearchHit[]>();
  readonly loading = input(false);
  readonly hydrated = input(false);
  readonly nowMs = input(Date.now());

  readonly skeletonSlots = [0, 1, 2, 3, 4, 5] as const;

  readonly #products = inject(ProductService);
  readonly #cache = inject(ProductCacheService);
  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);

  /** Keep last sibling map while the resource reloads so cards do not flash empty. */
  readonly #stableSiblings = signal<ReadonlyMap<string, readonly ProductCardSibling[]>>(
    new Map(),
  );

  readonly #siblingsResource = resource({
    params: () => uniqueModelGroups(this.hits().map((hit) => hit.modelGroup)),
    loader: async ({ params }) => {
      const map = await this.#products.listPublishedByModelGroups(params, 12);
      const all: Product[] = [];
      for (const list of map.values()) all.push(...list);
      this.#cache.seed(all);
      return toSiblingGroupsRecord(map);
    },
    id: 'shop-product-siblings',
  });

  readonly siblingsByGroup = computed(
    (): ReadonlyMap<string, readonly ProductCardSibling[]> => this.#stableSiblings(),
  );

  readonly cardPrices = computed<ReadonlyMap<string, ProductCardPrice>>(() => {
    const hits = this.hits();
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : [];
    const ctx = {
      now: new Date(this.nowMs()),
      signedIn: this.hydrated() && Boolean(this.#auth.user()),
    };

    const map = new Map<string, ProductCardPrice>();
    for (const hit of hits) {
      map.set(hit.objectID, searchHitCardPrice(hit, liveMode ? offers : null, ctx));
    }
    return map;
  });

  readonly cards = computed(() => {
    const prices = this.cardPrices();
    const siblings = this.siblingsByGroup();
    return this.hits().flatMap((hit) => {
      const price = prices.get(hit.objectID);
      if (!price) return [];
      return [searchHitToCardData(hit, price, siblings)];
    });
  });

  constructor() {
    effect(() => {
      if (!this.#siblingsResource.hasValue()) return;
      this.#stableSiblings.set(siblingGroupsMap(this.#siblingsResource.value()));
    });
  }
}
