import { NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { PDP_GALLERY_SIZES } from '@core/image/image-kit.loader';
import type { ProductImage } from '@core/services/products';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizeImageKitPath } from '@shared/utils/image';

/**
 * Product photos in a native scroll-snap row: swipe on touch, arrows and a "1/6" counter
 * centred under the photos. Vertical wheel scrolling is left to the page.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [NgOptimizedImage, AppImageFallbackDirective, SharedIconModule, MatButtonModule],
  templateUrl: './product-gallery.component.html',
  host: { class: 'block w-full' },
})
export class ProductGalleryComponent {
  readonly images = input.required<readonly ProductImage[]>();
  readonly name = input.required<string>();
  readonly activeColourImage = input<ProductImage | null>(null);

  readonly path = normalizeImageKitPath;
  readonly sizes = PDP_GALLERY_SIZES;

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  #frame = 0;

  readonly displayImages = computed<readonly ProductImage[]>(() => {
    const colourImg = this.activeColourImage();
    const base = this.images();
    if (!colourImg) return base;
    return [colourImg, ...base.filter((img) => img.path !== colourImg.path)];
  });

  /** Index of the first photo in view. Back to 0 when the photo list changes (another colour). */
  readonly active = linkedSignal({ source: this.displayImages, computation: () => 0 });

  /** True once the last photo is in view (two fit at once on wide screens). */
  readonly atEnd = linkedSignal({
    source: this.displayImages,
    computation: (images) => images.length <= 1,
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.#sync();
      const el = this.track()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.#sync());
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => {
      if (this.#frame) cancelAnimationFrame(this.#frame);
    });

    // A new colour puts its photo first: jump back to the start without animating.
    effect(() => {
      this.displayImages();
      untracked(() => {
        const el = this.track()?.nativeElement;
        if (el && typeof el.scrollTo === 'function') {
          el.scrollTo({ left: 0, behavior: 'instant' });
        }
      });
    });
  }

  step(direction: 1 | -1): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    const last = this.displayImages().length - 1;
    const target = Math.min(Math.max(this.active() + direction, 0), last);
    el.scrollTo({ left: target * this.#stride(el) });
  }

  onScroll(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#sync());
  }

  imageAlt(image: ProductImage, index: number): string {
    const base = image.alt || this.name();
    return index === 0 ? base : `${base}, photo ${index + 1}`;
  }

  #sync(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    const last = this.displayImages().length - 1;
    const index = Math.round(el.scrollLeft / this.#stride(el));
    this.active.set(Math.min(Math.max(index, 0), Math.max(last, 0)));
    this.atEnd.set(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }

  /** Width of one photo plus the gap after it. */
  #stride(el: HTMLElement): number {
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return el.clientWidth || 1;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    return first.offsetWidth + gap || 1;
  }
}
