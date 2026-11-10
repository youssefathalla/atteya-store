import { isPlatformBrowser } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyService } from '@core/services/currency/currency.service';
import { BannerOffersService } from '@core/services/offers/banner-offers.service';
import { bannerCountdown, bannerOffers, bannerText, offerShopQuery } from '@core/services/offers/offer-shop';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { SharedIconModule } from '@shared/ui/mat-icon';

/** One message of the bar: a live offer (links to its Shop page) or the shipping message. */
export interface AnnouncementSlide {
  readonly id: string;
  readonly kind: 'offer' | 'shipping';
  readonly text: string;
  /** "Ends in 2d 14h 05m" / "Ends in 05:12:33", or null. */
  readonly countdown: string | null;
  /** `/shop` query params of the offer's products; null for the shipping message. */
  readonly shopQuery: { readonly offer: string } | null;
}

/** Each slide shows this long before the bar fades to the next one. */
const SLIDE_MS = 5000;
/** A finger has to move this far sideways to count as a swipe. */
const SWIPE_PX = 40;

/**
 * The slim black bar above the navigation (ATS-145): up to 4 offers staff put in the top banner,
 * then the shipping message (EGP visitors only), one at a time. Two or more slides fade every
 * 5 seconds, pausing while the mouse is over it, it has keyboard focus, or a finger is on it;
 * arrows on desktop, swipe on phone. Reduced motion: no auto-rotation and no fade.
 */
@Component({
  selector: 'app-announcement-bar',
  host: {
    class: 'block w-full',
    // EGP-only copy stays hidden while the visitor's currency is still being worked out
    // (`html[data-cur-pending]`), so a bar holding only the shipping message hides with it.
    '[attr.data-shipping-only]': "shippingOnly() ? '' : null",
  },
  imports: [RouterLink, SharedIconModule],
  templateUrl: './announcement-bar.component.html',
})
export class AnnouncementBarComponent {
  readonly #shipping = inject(ShippingSettingsService);
  readonly #bannerOffers = inject(BannerOffersService);
  readonly #currency = inject(CurrencyService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #destroyRef = inject(DestroyRef);

  readonly #now = signal(new Date());
  readonly #index = signal(0);
  readonly #hovered = signal(false);
  readonly #focused = signal(false);
  readonly #touching = signal(false);
  readonly #reducedMotion = signal(false);
  #touchStartX: number | null = null;

  readonly slides = computed<readonly AnnouncementSlide[]>(() => {
    const now = this.#now();
    const slides: AnnouncementSlide[] = bannerOffers(
      this.#bannerOffers.offers(),
      now,
      this.#currency.visitorCountry(),
    ).map((offer) => ({
      id: `offer-${offer.id}`,
      kind: 'offer',
      text: bannerText(offer),
      countdown: bannerCountdown(offer, now),
      shopQuery: offerShopQuery(offer.id),
    }));
    const shipping = this.#shipping.bannerText();
    if (shipping) {
      slides.push({ id: 'shipping', kind: 'shipping', text: shipping, countdown: null, shopQuery: null });
    }
    return slides;
  });

  /** Number of slides; a plain number so the rotation timer only restarts when it really changes. */
  readonly #count = computed(() => this.slides().length);
  readonly activeIndex = computed(() => {
    const count = this.#count();
    return count > 0 ? this.#index() % count : 0;
  });
  readonly hasArrows = computed(() => this.#count() > 1);
  readonly shippingOnly = computed(() => this.#count() === 1 && this.slides()[0]?.kind === 'shipping');
  readonly #paused = computed(() => this.#hovered() || this.#focused() || this.#touching());
  /** Auto-rotation is running: screen readers aren't told about every change (`aria-live="off"`). */
  readonly rotating = computed(() => this.hasArrows() && !this.#paused() && !this.#reducedMotion());

  /** Offers with a start or end time need a clock every second (countdown, leaving on time). */
  readonly #needsClock = computed(() =>
    this.#bannerOffers
      .offers()
      .some((offer) => offer.banner?.show && (offer.schedule.startsAt || offer.schedule.endsAt)),
  );

  constructor() {
    if (!this.#isBrowser) return;

    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motion) {
      this.#reducedMotion.set(motion.matches);
      const onMotionChange = (event: MediaQueryListEvent) => this.#reducedMotion.set(event.matches);
      motion.addEventListener('change', onMotionChange);
      this.#destroyRef.onDestroy(() => motion.removeEventListener('change', onMotionChange));
    }

    effect((onCleanup) => {
      if (!this.#needsClock()) return;
      this.#now.set(new Date());
      const id = window.setInterval(() => this.#now.set(new Date()), 1000);
      onCleanup(() => window.clearInterval(id));
    });

    // Reading the index restarts the 5 seconds after an arrow or a swipe.
    effect((onCleanup) => {
      this.#index();
      if (!this.rotating()) return;
      const id = window.setTimeout(() => this.next(), SLIDE_MS);
      onCleanup(() => window.clearTimeout(id));
    });
  }

  next(): void {
    const count = this.#count();
    if (count > 1) this.#index.set((this.activeIndex() + 1) % count);
  }

  previous(): void {
    const count = this.#count();
    if (count > 1) this.#index.set((this.activeIndex() - 1 + count) % count);
  }

  /**
   * Only a real mouse pauses on hover: a tap fires compatibility mouse events with no matching
   * leave (iOS Safari), which would otherwise pause rotation for the rest of the visit.
   */
  onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.#hovered.set(true);
  }

  onPointerLeave(): void {
    this.#hovered.set(false);
  }

  onFocusIn(): void {
    this.#focused.set(true);
  }

  onFocusOut(event: FocusEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (!next || !bar.contains(next)) this.#focused.set(false);
  }

  onTouchStart(event: TouchEvent): void {
    this.#touching.set(true);
    this.#touchStartX = event.touches[0]?.clientX ?? null;
  }

  onTouchEnd(event: TouchEvent): void {
    this.#touching.set(false);
    const startX = this.#touchStartX;
    this.#touchStartX = null;
    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;
    const moved = endX - startX;
    if (Math.abs(moved) < SWIPE_PX) return;
    if (moved < 0) this.next();
    else this.previous();
  }

  onTouchCancel(): void {
    this.#touching.set(false);
    this.#touchStartX = null;
  }
}
