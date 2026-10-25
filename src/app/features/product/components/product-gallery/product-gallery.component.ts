import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, linkedSignal } from '@angular/core';
import type { ProductImage } from '@core/services/products';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizeImageKitPath } from '@shared/utils/image';

@Component({
  selector: 'app-product-gallery',
  imports: [NgOptimizedImage, AppImageFallbackDirective, SharedIconModule],
  templateUrl: './product-gallery.component.html',
  host: { class: 'block w-full' },
})
export class ProductGalleryComponent {
  readonly images = input.required<readonly ProductImage[]>();
  readonly name = input.required<string>();
  readonly activeColourImage = input<ProductImage | null>(null);

  readonly path = normalizeImageKitPath;

  readonly displayImages = computed<readonly ProductImage[]>(() => {
    const colourImg = this.activeColourImage();
    const base = this.images();
    if (!colourImg) return base;
    return [colourImg, ...base.filter((img) => img.path !== colourImg.path)];
  });

  readonly active = linkedSignal({
    source: () => ({
      images: this.images(),
      colourPath: this.activeColourImage()?.path ?? null,
    }),
    computation: () => 0,
  });

  readonly currentImage = computed<ProductImage | null>(() => {
    const imgs = this.displayImages();
    return imgs[this.active()] ?? imgs[0] ?? null;
  });

  select(index: number): void {
    this.active.set(index);
  }

  imageAlt(image: ProductImage): string {
    return image.alt || this.name();
  }
}
