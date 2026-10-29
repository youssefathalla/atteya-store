import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Product } from '@core/services/products/product.model';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';

export interface CatalogCardPrice {
  readonly price: number;
  readonly fromPrice: number | null;
  readonly listPrice: number | null;
  readonly partial: boolean;
  readonly badges: readonly string[];
}

@Component({
  selector: 'app-catalog-product-grid',
  host: { class: 'block w-full' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    AppImageFallbackDirective,
    PrefetchProductDirective,
    ProductPriceComponent,
    SkeletonComponent,
  ],
  templateUrl: './catalog-product-grid.component.html',
})
export class CatalogProductGridComponent {
  readonly products = input.required<readonly Product[]>();
  readonly brandNames = input.required<ReadonlyMap<string, string>>();
  readonly prices = input.required<ReadonlyMap<string, CatalogCardPrice>>();
  readonly loading = input(false);
  readonly skeletonSlots = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  brandLabel(brandId: string): string {
    return this.brandNames().get(brandId) ?? brandId;
  }

  priceFor(productId: string): CatalogCardPrice | undefined {
    return this.prices().get(productId);
  }
}
