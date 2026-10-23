import { Component, computed, model } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type {
  OfferAudience,
  OfferDraft,
  OfferSaleItemsPolicy,
  OfferStacking,
} from '@core/services/offers/engine';

@Component({
  selector: 'app-offer-settings',
  host: { class: 'block w-full' },
  imports: [MatCheckboxModule],
  templateUrl: './offer-settings.component.html',
})
export class OfferSettingsComponent {
  readonly draft = model.required<OfferDraft>();

  readonly saleItemsExplanation = computed(() => {
    switch (this.draft().saleItems) {
      case 'bestOf':
        return 'Example (list EGP 2,000, EasyOrders sale EGP 1,700, offer 20% off): 20% of 2,000 = EGP 1,600 beats 1,700, so the shopper pays EGP 1,600 (never both discounts).';
      case 'exclude':
        return 'Example: products that already have an EasyOrders sale price are skipped and stay at EGP 1,700.';
      case 'stack':
        return 'Example: products already on sale get this discount on top of their sale price (20% of 1,700 = EGP 1,360).';
    }
  });

  updateText(
    field: 'name' | 'title' | 'badge' | 'description' | 'code',
    event: Event,
  ): void {
    const raw = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update((prev) => {
      if (field === 'name') return { ...prev, name: raw };
      if (field === 'title') return { ...prev, title: raw };
      if (field === 'badge') return { ...prev, badge: raw.trim() ? raw : null };
      if (field === 'description') return { ...prev, description: raw.trim() ? raw : null };
      const upper = raw.trim().toUpperCase();
      return { ...prev, code: upper || null };
    });
  }

  toggleActive(active: boolean): void {
    this.draft.update((prev) => ({ ...prev, active }));
  }

  toggleRequiresCode(requiresCode: boolean): void {
    this.draft.update((prev) => ({
      ...prev,
      requiresCode,
      visibility: requiresCode ? 'code' : 'public',
    }));
  }

  onAudienceChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as OfferAudience;
    this.draft.update((prev) => ({
      ...prev,
      audience: val === 'signedIn' ? 'signedIn' : 'everyone',
    }));
  }

  onStackingChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as OfferStacking;
    this.draft.update((prev) => ({
      ...prev,
      stacking: val === 'exclusive' ? 'exclusive' : 'stackable',
    }));
  }

  onSaleItemsChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as OfferSaleItemsPolicy;
    this.draft.update((prev) => ({
      ...prev,
      saleItems: val === 'exclude' || val === 'stack' ? val : 'bestOf',
    }));
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
