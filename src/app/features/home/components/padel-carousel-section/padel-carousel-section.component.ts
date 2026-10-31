import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  PLATFORM_ID,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '@core/services/products';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';
import { RowScrollNavComponent } from '../row-scroll-nav/row-scroll-nav.component';
import { rowScrollProgress, scrollRowByItem } from '../../utils/row-scroll';

const PADEL_CAROUSEL_LIMIT = 16;

@Component({
  selector: 'app-padel-carousel-section',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    NgOptimizedImage,
    AppImageFallbackDirective,
    PrefetchProductDirective,
    HorizontalScrollDirective,
    SkeletonComponent,
    RowScrollNavComponent,
  ],
  templateUrl: './padel-carousel-section.component.html',
})
export class PadelCarouselSectionComponent {
  readonly #products = inject(ProductService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.#platformId);

  readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scrollRow');

  readonly progress = signal(0);
  readonly canPrev = signal(false);
  readonly canNext = signal(false);

  readonly #list = resource({
    loader: () =>
      this.#products.listPublished({ categoryId: 'rackets', limit: PADEL_CAROUSEL_LIMIT }),
  });

  readonly products = computed(() => {
    if (this.#list.error() || !this.#list.hasValue()) return [];
    return this.#list.value() ?? [];
  });

  readonly isLoading = computed(
    () => this.#list.isLoading() || (!this.#list.hasValue() && !this.#list.error()),
  );

  constructor() {
    afterRenderEffect((onCleanup) => {
      if (!this.isBrowser) return;
      const el = this.scrollEl()?.nativeElement;
      if (!el) return;

      const sync = () => {
        const state = rowScrollProgress(el);
        this.progress.set(state.progress);
        this.canPrev.set(state.canPrev);
        this.canNext.set(state.canNext);
      };
      sync();
      el.addEventListener('scroll', sync, { passive: true });
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
      ro?.observe(el);
      onCleanup(() => {
        el.removeEventListener('scroll', sync);
        ro?.disconnect();
      });
    });
  }

  imagePath(path: string | undefined): string | null {
    if (!path) return null;
    const normalized = normalizeImageKitPath(path);
    return normalized || null;
  }

  prev(): void {
    const el = this.scrollEl()?.nativeElement;
    if (el) scrollRowByItem(el, -1);
  }

  next(): void {
    const el = this.scrollEl()?.nativeElement;
    if (el) scrollRowByItem(el, 1);
  }
}
