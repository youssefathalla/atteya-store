import { Component, inject, type OnInit, RESPONSE_INIT } from '@angular/core';
import { SeoService } from '@core/services/seo';
import { ErrorPageComponent } from '@shared/ui/error-page';
import { markNotFound } from '@shared/utils/error-response';

/**
 * Any address the store doesn't know (the `**` route inside the store layout, ATS-268): Page Not Found,
 * answered with HTTP 404, `noindex` and `private, no-store`.
 */
@Component({
  selector: 'app-not-found-page',
  host: { class: 'block w-full min-h-[60vh] container-content' },
  imports: [ErrorPageComponent],
  template: `<app-error-page kind="not-found" />`,
})
export class NotFoundPage implements OnInit {
  readonly #seo = inject(SeoService);

  constructor() {
    markNotFound(inject(RESPONSE_INIT, { optional: true }));
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Page Not Found | Atteya Store',
      description: 'This page moved or no longer exists.',
      noindex: true,
    });
  }
}
