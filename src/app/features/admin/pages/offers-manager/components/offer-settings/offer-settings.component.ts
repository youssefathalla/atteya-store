import { Component, computed, model } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { OfferAudience, OfferDraft, OfferSaleItemsPolicy } from '@core/services/offers/engine';

@Component({
  selector: 'app-offer-settings',
  host: { class: 'block w-full' },
  imports: [MatCheckboxModule],
  templateUrl: './offer-settings.component.html',
})
export class OfferSettingsComponent {
  readonly draft = model.required<OfferDraft>();

  readonly saleItemsExplanation = computed(() =>
    this.draft().saleItems === 'exclude'
      ? 'Example: products that already have a sale price are skipped and stay at EGP 1,700.'
      : 'Example (list EGP 2,000, sale price EGP 1,700, offer 20% off): 20% of 2,000 = EGP 1,600 beats 1,700, so the shopper pays EGP 1,600 (never both discounts).',
  );

  updateText(field: 'name' | 'title' | 'badge' | 'description', event: Event): void {
    const raw = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update((prev) => {
      if (field === 'name') return { ...prev, name: raw };
      if (field === 'title') return { ...prev, title: raw };
      if (field === 'badge') return { ...prev, badge: raw.trim() ? raw : null };
      return { ...prev, description: raw.trim() ? raw : null };
    });
  }

  toggleActive(active: boolean): void {
    this.draft.update((prev) => ({ ...prev, active }));
  }

  onAudienceChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as OfferAudience;
    const audience: OfferAudience = val === 'signedIn' ? 'signedIn' : 'everyone';
    this.draft.update((prev) => ({
      ...prev,
      audience,
      // Only offers for everyone can show in the top banner.
      ...(audience !== 'everyone' && prev.banner?.show ? { banner: { ...prev.banner, show: false } } : {}),
    }));
  }

  onSaleItemsChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as OfferSaleItemsPolicy;
    this.draft.update((prev) => ({ ...prev, saleItems: val === 'exclude' ? 'exclude' : 'bestOf' }));
  }

  onPriorityChange(event: Event): void {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);
    const priority = Number.isFinite(parsed) ? Math.max(-100, Math.min(100, parsed)) : 0;
    this.draft.update((prev) => ({ ...prev, priority }));
  }

  onLimitChange(bound: 'totalUses' | 'perCustomer', event: Event): void {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);
    const val = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.draft.update((prev) => ({
      ...prev,
      limits: {
        ...prev.limits,
        [bound]: val,
      },
    }));
  }
}
