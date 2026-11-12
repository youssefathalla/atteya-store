import { ErrorHandler, inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { isChunkLoadError } from './page-load-error';
import { PageLoadErrorService } from './page-load-error.service';

/**
 * Angular's own error handler, plus: a page whose code couldn't be downloaded while the store was
 * opening it shows Something Went Wrong with Try Again instead of nothing happening (ATS-268).
 * Other errors are logged exactly as before.
 */
export class AppErrorHandler extends ErrorHandler {
  readonly #injector = inject(Injector);

  override handleError(error: unknown): void {
    if (isChunkLoadError(error)) {
      // Only while a page is opening: a failed part of a page that is already showing (a deferred
      // footer, say) never replaces the whole page.
      const router = this.#injector.get(Router);
      const navigation = router.currentNavigation();
      if (navigation) {
        const target = navigation.finalUrl ?? navigation.extractedUrl;
        this.#injector.get(PageLoadErrorService).report(router.serializeUrl(target));
      }
    }
    super.handleError(error);
  }
}
