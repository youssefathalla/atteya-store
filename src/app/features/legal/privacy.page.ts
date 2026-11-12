import { Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-privacy-page',
  host: { class: 'block w-full' },
  imports: [RouterLink],
  templateUrl: './privacy.page.html',
})
export class PrivacyPage implements OnInit {
  readonly #seo = inject(SeoService);

  readonly email = STORE_INFO.contact.email;
  readonly phone = STORE_INFO.contact.phone;
  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Privacy Policy | Atteya Store',
      description: 'What Atteya Store keeps about you, why, and the choices you have.',
    });
  }
}
