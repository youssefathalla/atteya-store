import { Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-terms-page',
  host: { class: 'block w-full' },
  imports: [RouterLink],
  templateUrl: './terms.page.html',
})
export class TermsPage implements OnInit {
  readonly #seo = inject(SeoService);

  readonly email = STORE_INFO.contact.email;
  readonly phone = STORE_INFO.contact.phone;
  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Terms and Conditions | Atteya Store',
      description:
        'The terms for browsing and ordering at Atteya Store: prices, payment, delivery and returns.',
    });
  }
}
