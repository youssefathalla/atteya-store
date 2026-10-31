import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID, Service } from '@angular/core';
import { AuthService } from '@core/services/auth/auth.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { NavService } from '@core/services/navigation';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';

/** True when storefront chrome can render without half-ready flicker (first load only gate). */
@Service()
export class ShellReadyService {
  readonly #currency = inject(CurrencyService);
  readonly #auth = inject(AuthService);
  readonly #shipping = inject(ShippingSettingsService);
  readonly #nav = inject(NavService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly chromeReady = computed(
    () =>
      this.#currency.ready() &&
      this.#shipping.shellReady() &&
      this.#nav.shellReady(),
  );

  readonly ready = computed(
    () =>
      this.chromeReady() &&
      (isPlatformBrowser(this.#platformId) ? this.#auth.isAuthReady() : true),
  );
}
