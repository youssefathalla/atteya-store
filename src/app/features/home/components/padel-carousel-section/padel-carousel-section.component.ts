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
  TransferState,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '@core/services/products';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';
import { RowScrollNavComponent } from '@shared/ui/row-scroll-nav';
import { rowScrollProgress } from '@shared/utils/row-scroll.utils';
import { RowScrollLockDirective } from '../../directives/row-scroll-lock.directive';
import { HOME_PADEL_ROW_KEY, putHomeRowSeed, takeHomeRowSeed } from '../../utils/home-row-products.state';

/** Rackets shown in the home Padel row. */
const PADEL_CAROUSEL_LIMIT = 8;

@Component({
  selector: 'app-padel-carousel-section',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    NgOptimizedImage,
    AppImageFallbackDirective,
    PrefetchProductDirective,
    HorizontalScrollDirective,
    RowScrollLockDirective,
    SharedIconModule,
    SkeletonComponent,
    RowScrollNavComponent,
  ],
  templateUrl: './padel-carousel-section.component.html',
})
export class PadelCarouselSectionComponent {
  readonly #products = inject(ProductService);
  readonly #transfer = inject(TransferState);
  readonly #platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.#platformId);

  readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scrollRow');

  readonly progress = signal(0);
  readonly canPrev = signal(false);
  readonly canNext = signal(false);

  /** SSR TransferState seed — keeps tiles visible across hydrate (no skeleton flash). */
  readonly #seeded = signal(takeHomeRowSeed(this.#transfer, HOME_PADEL_ROW_KEY, this.isBrowser));

  readonly #list = resource({
    loader: async () => {
      const products = await this.#products.listPublished({
        categoryId: 'rackets',
        limit: PADEL_CAROUSEL_LIMIT,
      });
      putHomeRowSeed(this.#transfer, HOME_PADEL_ROW_KEY, products, this.isBrowser);
      return products;
    },
  });

  readonly products = computed(() => {
    if (this.#list.hasValue()) return this.#list.value() ?? [];
    return this.#seeded() ?? [];
  });

  readonly isLoading = computed(() => {
    if (this.#seeded() !== undefined) return false;
    if (this.#list.hasValue() || this.#list.error()) return false;
    return true;
  });

  /** Hide heading + padding when empty/failed after load. */
  readonly showSection = computed(() => this.isLoading() || this.products().length > 0);

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
}
