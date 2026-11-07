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

/** Pixels the mouse must move before a press becomes a drag. */
const DRAG_START_PX = 4;
/** Share of a photo's width a drag must cover to move to the next photo. */
const DRAG_FLIP_RATIO = 0.15;
const DRAGGING_CLASS = 'pdp-gallery-track--dragging';

/**
 * Product photos in a native scroll-snap row: swipe on touch, drag with a mouse, arrows and a
 * "1/6" counter centred under the photos. Vertical wheel scrolling is left to the page.
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
  /** Mouse drag in progress; null when the mouse is up (touch uses native swiping). */
  #drag: { pointerId: number; startX: number; startLeft: number; moved: boolean } | null = null;

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

  onPointerDown(event: PointerEvent): void {
    const el = this.track()?.nativeElement;
    if (!el || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    this.#drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: el.scrollLeft,
      moved: false,
    };
  }

  onPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    const el = this.track()?.nativeElement;
    if (!drag || !el || event.pointerId !== drag.pointerId) return;
    // Released outside the photos before the drag started: forget the press.
    if ((event.buttons & 1) === 0) {
      this.#drag = null;
      return;
    }
    const dx = event.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      drag.moved = true;
      // Set straight on the element: snapping and smooth scrolling must be off before the next move.
      el.classList.add(DRAGGING_CLASS);
      el.setPointerCapture(drag.pointerId);
    }
    el.scrollLeft = drag.startLeft - dx;
  }

  onPointerEnd(event: PointerEvent): void {
    const drag = this.#drag;
    const el = this.track()?.nativeElement;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#drag = null;
    if (!el || !drag.moved) return;

    if (el.hasPointerCapture(drag.pointerId)) el.releasePointerCapture(drag.pointerId);
    const stride = this.#stride(el);
    const startIndex = Math.round(drag.startLeft / stride);
    const dragged = drag.startLeft - el.scrollLeft;
    // A short flick is enough to move one photo; a long drag lands on the nearest photo.
    let target = startIndex;
    if (Math.abs(dragged) >= stride * DRAG_FLIP_RATIO) {
      const photos = Math.max(1, Math.round(Math.abs(dragged) / stride));
      target = startIndex + (dragged < 0 ? photos : -photos);
    }
    const lastLeft = el.scrollWidth - el.clientWidth;
    el.classList.remove(DRAGGING_CLASS);
    el.scrollTo({ left: Math.min(Math.max(target * stride, 0), lastLeft) });
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
