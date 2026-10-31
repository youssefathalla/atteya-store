import { Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-privacy-page',
  host: { class: 'block w-full' },
  imports: [RouterLink],
  template: `
    <article class="container-content elements-start-col gap-6 max-w-3xl">
      <nav aria-label="Breadcrumb" class="flex flex-wrap items-center gap-2 font-label-sm uppercase">
        <a routerLink="/" class="hover:underline transition-colors">Home</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Privacy</span>
      </nav>
      <h1 class="font-headline-sm font-bold!">Privacy Policy</h1>
      <p class="font-label-md uppercase tracking-wider text-on-surface-variant">
        Placeholder — not legal advice
      </p>
      <div class="elements-start-col gap-3 font-body-md">
        <p>
          This page is a temporary placeholder. The store owner will replace this text with the
          real Privacy Policy for Atteya Store.
        </p>
        <p>
          Until that copy is published, creating an account still asks you to agree to the Terms
          and Conditions and this Privacy Policy so consent can be recorded.
        </p>
      </div>
    </article>
  `,
})
export class PrivacyPage implements OnInit {
  readonly #seo = inject(SeoService);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Privacy Policy | Atteya Store',
      description: 'Placeholder Privacy Policy for Atteya Store. Real client copy pending.',
      noindex: true,
    });
  }
}
