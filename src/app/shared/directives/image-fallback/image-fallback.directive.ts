import {
  afterNextRender,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { buildStorageUrl } from '@shared/utils/image';

/**
 * Unified image directive for `<img [ngSrc]="..." appImageFallback>`:
 * 1. Displays a monochrome M3 `.skeleton` shimmer while the image is downloading in the browser.
 * 2. Returns `isLoading() === false` during SSR prerendering so semantic headings/buttons remain visible in static HTML.
 * 3. Automatically fails over once to `buildStorageUrl()` (direct Google Cloud Storage origin)
 *    if the ImageKit CDN request fails or is still syncing.
 * 4. Emits `(imageFailed)` only if both ImageKit and direct Storage fail.
 */
@Directive({
  selector: 'img[appImageFallback]',
  exportAs: 'appImageFallback',
  host: {
    '[class.skeleton]': 'isLoading()',
    '(load)': 'onLoad()',
    '(error)': 'onError()',
  },
})
export class AppImageFallbackDirective {
  readonly #el = inject<ElementRef<HTMLImageElement>>(ElementRef);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Optional explicit relative path or URL. If omitted, reads the element's `src`. */
  readonly appImageFallback = input<string>('');

  readonly imageFailed = output<void>();

  readonly #isLoading = signal(this.#isBrowser);
  #triedFallback = false;

  readonly isLoading = this.#isLoading.asReadonly();

  constructor() {
    effect(() => {
      const _trackedPath = this.appImageFallback();
      this.#triedFallback = false;
      if (!this.#isBrowser) return;

      const img = this.#el.nativeElement;
      if (!img.complete || img.naturalWidth === 0) {
        this.#isLoading.set(true);
      }
    });

    afterNextRender(() => {
      const img = this.#el.nativeElement;
      if (img.complete && img.naturalWidth > 0) {
        this.#isLoading.set(false);
      }
    });
  }

  protected onLoad(): void {
    this.#isLoading.set(false);
  }

  protected onError(): void {
    const img = this.#el.nativeElement;
    if (!this.#triedFallback) {
      this.#triedFallback = true;
      const rawSource = this.appImageFallback() || img.getAttribute('src') || '';
      const fallbackUrl = buildStorageUrl(rawSource);
      if (fallbackUrl && img.src !== fallbackUrl) {
        img.removeAttribute('srcset');
        img.src = fallbackUrl;
        return;
      }
    }

    this.#isLoading.set(false);
    this.imageFailed.emit();
  }
}
