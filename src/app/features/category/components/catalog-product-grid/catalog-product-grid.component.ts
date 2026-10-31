import { Component, computed, inject, input, resource } from '@angular/core';
import type { Product } from '@core/services/products/product.model';
import { ProductCacheService, ProductService } from '@core/services/products';
import {
  ProductCardComponent,
} from '@shared/components/product-card/product-card.component';
import type { ProductCardPrice } from '@shared/components/product-card/product-card.model';
import { productToCardData } from '@shared/components/product-card/product-card.utils';
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

  readonly #siblingsResource = resource({
    params: () => {
      const groups = this.products()
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

  readonly siblingsByGroup = computed((): ReadonlyMap<string, readonly Product[]> => {
    if (!this.#siblingsResource.hasValue()) return new Map();
    return this.#siblingsResource.value();
  });

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
