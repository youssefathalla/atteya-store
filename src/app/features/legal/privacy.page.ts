import { Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-privacy-page',
  host: { class: 'block w-full' },
  imports: [RouterLink],
  templateUrl: './privacy.page.html',
})
export class PrivacyPage implements OnInit {
  readonly #seo = inject(SeoService);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Privacy Policy | Atteya Store',
      description:
        'Draft Privacy Policy for Atteya Store. This policy is being finalized and may change.',
      noindex: true,
    });
  }
}
