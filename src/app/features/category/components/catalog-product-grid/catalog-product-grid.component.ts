import { Component, computed, inject, input, resource } from '@angular/core';
import type { Product } from '@core/services/products/product.model';
import { ProductCacheService, ProductService } from '@core/services/products';
import {
  ProductCardComponent,
} from '@shared/components/product-card/product-card.component';
import type {
  ProductCardPrice,
  ProductCardSibling,
} from '@shared/components/product-card/product-card.model';
import {
  productToCardData,
  siblingGroupsMap,
  toSiblingGroupsRecord,
  uniqueModelGroups,
} from '@shared/components/product-card/product-card.utils';
import { SkeletonComponent } from '@shared/ui/skeleton';

export type CatalogCardPrice = ProductCardPrice;

@Component({
  selector: 'app-catalog-product-grid',
  host: { class: 'block w-full' },
  imports: [ProductCardComponent, SkeletonComponent],
  templateUrl: './catalog-product-grid.component.html',
})
export class CatalogProductGridComponent {
  readonly products = input.required<readonly Product[]>();
  readonly prices = input.required<ReadonlyMap<string, CatalogCardPrice>>();
  readonly loading = input(false);
  readonly skeletonSlots = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  readonly #products = inject(ProductService);
  readonly #cache = inject(ProductCacheService);

  /**
   * Stable `id` + JSON-safe lean sibling record so SSR TransferState matches
   * the first client paint (no flash of missing colour thumbs).
   */
  readonly #siblingsResource = resource({
    params: () =>
      uniqueModelGroups(this.products().map((product) => product.modelGroup)),
    loader: async ({ params }) => {
      const map = await this.#products.listPublishedByModelGroups(params, 12);
      const all: Product[] = [];
      for (const list of map.values()) all.push(...list);
      this.#cache.seed(all);
      return toSiblingGroupsRecord(map);
    },
    id: 'catalog-product-siblings',
  });

  readonly siblingsByGroup = computed(
    (): ReadonlyMap<string, readonly ProductCardSibling[]> => {
      if (!this.#siblingsResource.hasValue()) return new Map();
      return siblingGroupsMap(this.#siblingsResource.value());
    },
  );

  readonly cards = computed(() => {
    const prices = this.prices();
    const siblings = this.siblingsByGroup();
    return this.products().flatMap((product) => {
      const price = prices.get(product.id);
      if (!price) return [];
      return [productToCardData(product, price, siblings)];
    });
  });
}
