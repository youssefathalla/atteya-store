import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService, type Product, ProductService } from '@core/services/products';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { normalizeImageKitPath } from '@shared/utils/image';
import { toProductView } from '../../models/product-page.model';
import { isProductInStock } from '../../utils/product-stock.utils';

@Component({
  selector: 'app-product-siblings',
  imports: [
    RouterLink,
    NgOptimizedImage,
    AppImageFallbackDirective,
    ProductPriceComponent,
    HorizontalScrollDirective,
  ],
  templateUrl: './product-siblings.component.html',
  host: { class: 'block w-full' },
})
export class ProductSiblingsComponent {
  readonly modelGroup = input.required<string>();
  readonly excludeId = input.required<string>();

  readonly #products = inject(ProductService);
  readonly #catalog = inject(CatalogService);

  readonly imagePath = normalizeImageKitPath;

  readonly siblings = resource({
    params: () => ({ g: this.modelGroup(), x: this.excludeId() }),
    loader: ({ params }) => this.#products.listModelGroup(params.g, params.x, 8),
  });

  readonly list = computed<readonly Product[]>(() => {
    if (!this.siblings.hasValue()) return [];
    return this.siblings.value().filter((item) => isProductInStock(toProductView(item)));
  });

  readonly hasSiblings = computed(() => this.siblings.hasValue() && this.list().length > 0);

  brandName(brandId: string): string {
    return this.#catalog.brandBySlug(brandId)?.name ?? brandId;
  }

  siblingAlt(item: Product): string {
    return item.images[0]?.alt || item.name;
  }
}
