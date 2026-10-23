import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-shipping-banner',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, SharedIconModule],
  templateUrl: './shipping-banner.component.html',
})
export class ShippingBannerComponent {
  readonly #shipping = inject(ShippingSettingsService);
  readonly #dismissedText = signal('');

  readonly text = computed(() => {
    const text = this.#shipping.bannerText();
    return text && text !== this.#dismissedText() ? text : '';
  });

  dismiss(): void {
    this.#dismissedText.set(this.#shipping.bannerText());
  }
}
