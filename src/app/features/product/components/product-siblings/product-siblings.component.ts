import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ProductCacheService,
  type Product,
  type ProductImage,
  ProductService,
} from '@core/services/products';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { normalizeImageKitPath } from '@shared/utils/image';
import { toProductView } from '../../models/product-page.model';
import { isProductInStock } from '../../utils/product-stock.utils';

/**
 * Other colours of the same model (`modelGroup`) as small photo links in the details column.
 * The open product comes first, underlined. Shows nothing until another in-stock colour exists.
 */
@Component({
  selector: 'app-product-siblings',
  imports: [RouterLink, NgOptimizedImage, AppImageFallbackDirective, PrefetchProductDirective],
  templateUrl: './product-siblings.component.html',
  // Collapses (no flex gap) when there is no other colour to show.
  host: { class: 'block w-full empty:hidden' },
})
export class ProductSiblingsComponent {
  readonly modelGroup = input.required<string>();
  readonly excludeId = input.required<string>();
  /** Main photo and name of the open product. */
  readonly currentImage = input<ProductImage | null>(null);
  readonly currentName = input.required<string>();
  /** Line above the photos, e.g. "Colour: Navy". */
  readonly label = input.required<string>();

  readonly #products = inject(ProductService);
  readonly #cache = inject(ProductCacheService);

  readonly imagePath = normalizeImageKitPath;

  readonly siblings = resource({
    params: () => ({ g: this.modelGroup(), x: this.excludeId() }),
    loader: ({ params }) =>
      this.#products.listModelGroup(params.g, params.x, 8).then((list) => {
        this.#cache.seed(list);
        return list;
      }),
  });

  readonly list = computed<readonly Product[]>(() => {
    if (!this.siblings.hasValue()) return [];
    return this.siblings.value().filter((item) => isProductInStock(toProductView(item)));
  });
}
