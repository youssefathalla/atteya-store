import { Component, computed, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  clampBannerCountdownDays,
  MAX_BANNER_COUNTDOWN_DAYS,
  MAX_BANNER_TEXT,
  MIN_BANNER_COUNTDOWN_DAYS,
  type OfferAudience,
  type OfferBanner,
  type OfferBannerCountdown,
} from '@core/services/offers/engine';

/** "Show in the top banner" extra on step 3 of the offer editor: put the offer in the storefront's announcement bar. */
@Component({
  selector: 'app-banner-editor',
  host: { class: 'block w-full' },
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule],
  templateUrl: './banner-editor.component.html',
})
export class BannerEditorComponent {
  readonly banner = model.required<OfferBanner>();
  /** Only offers for everyone can show in the bar (Shop lists only those). */
  readonly audience = input.required<OfferAudience>();
  /** Coupon-code offers are hidden from Shop, so they cannot show in the bar either. */
  readonly requiresCode = input(false);
  /** The customer title, shown as the placeholder of an empty banner text. */
  readonly title = input('');
  readonly hasEndDate = input(false);
  /** Offers with a per-customer limit are for signed-in shoppers only, so they can't show either. */
  readonly hasPerCustomerLimit = input(false);

  readonly maxText = MAX_BANNER_TEXT;
  readonly minDays = MIN_BANNER_COUNTDOWN_DAYS;
  readonly maxDays = MAX_BANNER_COUNTDOWN_DAYS;

  readonly canShow = computed(
    () => this.audience() === 'everyone' && !this.requiresCode() && !this.hasPerCustomerLimit(),
  );
  readonly showing = computed(() => this.canShow() && this.banner().show);
  readonly textPlaceholder = computed(() => this.title().trim() || 'Leave blank to use the customer title');

  onShowChange(event: MatSlideToggleChange): void {
    this.banner.update((prev) => ({ ...prev, show: event.checked && this.canShow() }));
  }

  onTextChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.banner.update((prev) => ({ ...prev, text: raw.trim() ? raw.slice(0, MAX_BANNER_TEXT) : null }));
  }

  onCountdownChange(raw: OfferBannerCountdown): void {
    const countdown: OfferBannerCountdown = raw === 'always' || raw === 'lastDays' ? raw : 'hide';
    this.banner.update((prev) => ({ ...prev, countdown }));
  }

  onDaysChange(event: Event): void {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isFinite(parsed)) return;
    this.banner.update((prev) => ({ ...prev, countdownDays: clampBannerCountdownDays(parsed) }));
  }
}
