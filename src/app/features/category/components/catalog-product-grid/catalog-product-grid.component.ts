import { Component, computed, input } from '@angular/core';
import type { Product } from '@core/services/products/product.model';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
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

  readonly cards = computed(() => {
    const prices = this.prices();
    return this.products().flatMap((product) => {
      const price = prices.get(product.id);
      if (!price) return [];
      return [productToCardData(product, price)];
    });
  });
}
