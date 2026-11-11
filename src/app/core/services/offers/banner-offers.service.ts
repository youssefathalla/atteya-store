import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, Service, signal, TransferState } from '@angular/core';
import type { Offer } from './engine';
import { BANNER_OFFERS_KEY } from './banner-offers.state';
import { fromTransferOffer } from './offer-transfer';
import { OffersService } from './offers.service';

/** Same wait as the shipping settings: a stuck listener never holds the store loader forever. */
const SHELL_READY_TIMEOUT_MS = 2500;

/**
 * Offers the top announcement bar can show. The server render and the first browser frame use the
 * `banner-offers` seed from `bannerOffersResolver`; once `OffersService`'s live listener has
 * answered, the bar follows it, so a paused, archived or ended offer leaves without a reload.
 * The bar itself picks and orders the slides (`bannerOffers` in `offer-shop.ts`).
 */
@Service()
export class BannerOffersService {
  readonly #offers = inject(OffersService);
  readonly #transfer = inject(TransferState);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** undefined = no seed (client-rendered page); null = the server read failed. */
  readonly #seed = signal<readonly Offer[] | null | undefined>(undefined);
  readonly #timedOut = signal(false);

  constructor() {
    if (this.#transfer.hasKey(BANNER_OFFERS_KEY)) {
      const seed = this.#transfer.get(BANNER_OFFERS_KEY, null);
      this.#seed.set(seed ? seed.map(fromTransferOffer) : null);
      if (this.#isBrowser) this.#transfer.remove(BANNER_OFFERS_KEY);
    }

    if (this.#isBrowser && this.#seed() === undefined) {
      const timeoutId = window.setTimeout(() => this.#timedOut.set(true), SHELL_READY_TIMEOUT_MS);
      inject(DestroyRef).onDestroy(() => window.clearTimeout(timeoutId));
    }
  }

  /** Every offer the bar may pick from (live listener in the browser once it answered, else the seed). */
  readonly offers = computed<readonly Offer[]>(() => {
    if (this.#isBrowser && this.#offers.ready()) return this.#offers.all();
    return this.#seed() ?? [];
  });

  /** The bar has its first answer (seed, live listener or the timeout), so it won't change shape. */
  readonly shellReady = computed(
    () => !this.#isBrowser || this.#seed() !== undefined || this.#offers.ready() || this.#timedOut(),
  );
}
