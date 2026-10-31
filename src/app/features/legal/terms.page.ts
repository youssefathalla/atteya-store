import { Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-terms-page',
  host: { class: 'block w-full' },
  imports: [RouterLink],
  templateUrl: './terms.page.html',
})
export class TermsPage implements OnInit {
  readonly #seo = inject(SeoService);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Terms and Conditions | Atteya Store',
      description:
        'Draft Terms and Conditions for Atteya Store. This policy is being finalized and may change.',
      noindex: true,
    });
  }
}
