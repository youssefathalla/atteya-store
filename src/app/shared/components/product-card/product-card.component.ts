import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ProductCardColorway, ProductCardData } from './product-card.model';
import { visibleColorways } from './product-card.utils';

@Component({
  selector: 'app-product-card',
  host: { class: 'product-card block w-full' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    AppImageFallbackDirective,
    PrefetchProductDirective,
    HorizontalScrollDirective,
    ProductPriceComponent,
  ],
  templateUrl: './product-card.component.html',
})
export class ProductCardComponent {
  readonly product = input.required<ProductCardData>();
  readonly priority = input(false);
  readonly sizes = input('(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw');

  /** Hover preview for a sibling colourway photo (does not change navigation). */
  readonly #preview = signal<ProductCardColorway | null>(null);

  readonly colorwayRow = computed(() => visibleColorways(this.product().colorways));

  readonly displayImagePath = computed(() => {
    const preview = this.#preview();
    if (preview?.imagePath) return preview.imagePath;
    return this.product().imagePath;
  });

  readonly displayImageAlt = computed(() => {
    const preview = this.#preview();
    if (preview) return preview.imageAlt;
    return this.product().imageAlt;
  });

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  isSelected(colorway: ProductCardColorway): boolean {
    return colorway.productId === this.product().id;
  }

  onColorEnter(colorway: ProductCardColorway): void {
    this.#preview.set(colorway);
  }

  onColorLeave(): void {
    this.#preview.set(null);
  }
}
