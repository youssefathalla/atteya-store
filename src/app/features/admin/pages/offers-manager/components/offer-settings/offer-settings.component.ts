import { Component, computed, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { OfferDraft, OfferSaleItemsPolicy } from '@core/services/offers/engine';

/** Step 3 → Extras → More settings: products already on sale, badge override and priority. */
@Component({
  selector: 'app-offer-settings',
  host: { class: 'block w-full' },
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './offer-settings.component.html',
})
export class OfferSettingsComponent {
  readonly draft = model.required<OfferDraft>();

  readonly saleItemsExplanation = computed(() =>
    this.draft().saleItems === 'exclude'
      ? 'Products that already have a sale price keep it and get nothing more.'
      : 'Shoppers get whichever price is lower, never both discounts.',
  );

  onBadgeChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.draft.update((prev) => ({ ...prev, badge: raw.trim() ? raw : null }));
  }

  onSaleItemsChange(value: OfferSaleItemsPolicy): void {
    this.draft.update((prev) => ({ ...prev, saleItems: value === 'exclude' ? 'exclude' : 'bestOf' }));
  }

  onPriorityChange(event: Event): void {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);
    const priority = Number.isFinite(parsed) ? Math.max(-100, Math.min(100, parsed)) : 0;
    this.draft.update((prev) => ({ ...prev, priority }));
  }
}
