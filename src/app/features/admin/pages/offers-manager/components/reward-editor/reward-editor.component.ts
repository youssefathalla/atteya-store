import { Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type {
  OfferMinimum,
  OfferReward,
  OfferScope,
  OfferTier,
} from '@core/services/offers/engine';
import type { Product } from '@core/services/products/product.model';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { REWARD_PICKER_OPTIONS, type RewardPickerKind } from '../../models/offer-admin.model';

@Component({
  selector: 'app-reward-editor',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatCheckboxModule, SharedIconModule],
  templateUrl: './reward-editor.component.html',
})
export class RewardEditorComponent {
  readonly reward = model.required<OfferReward>();
  readonly scope = model.required<OfferScope>();
  readonly minimum = model.required<OfferMinimum | null>();
  readonly products = input.required<readonly Product[]>();

  readonly pickerOptions = REWARD_PICKER_OPTIONS;

  readonly selectedPickerKind = computed<RewardPickerKind>(() => {
    const r = this.reward();
    if (this.scope() === 'cart' && (r.kind === 'percentOff' || r.kind === 'amountOff')) {
      return 'cartThreshold';
    }
    return r.kind;
  });

  readonly isDeferredReward = computed(() => {
    const kind = this.selectedPickerKind();
    return (
      kind === 'buyXGetY' ||
      kind === 'freeGift' ||
      kind === 'freeShipping' ||
      kind === 'cartThreshold'
    );
  });

  onKindChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const picked = target.value as RewardPickerKind;

    switch (picked) {
      case 'percentOff':
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({ kind: 'percentOff', percent: 10 });
        break;
      case 'amountOff':
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({ kind: 'amountOff', amount: 200 });
        break;
      case 'fixedPrice':
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({ kind: 'fixedPrice', price: 1000 });
        break;
      case 'buyXGetY':
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({
          kind: 'buyXGetY',
          buy: { quantity: 2 },
          get: { quantity: 1, percent: 100 },
          getConditions: null,
          cheapestFree: true,
          repeat: true,
          maxApplications: null,
        });
        break;
      case 'tiered':
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({
          kind: 'tiered',
          basis: 'quantity',
          tiers: [
            { min: 1, percent: 10 },
            { min: 3, percent: 20 },
          ],
        });
        break;
      case 'freeGift':
        this.scope.set('cart');
        this.minimum.set({ subtotal: 3000 });
        this.reward.set({
          kind: 'freeGift',
          giftProductId: this.products()[0]?.id ?? '',
          giftVariantId: null,
          quantity: 1,
        });
        break;
      case 'freeShipping':
        this.scope.set('cart');
        this.minimum.set({ subtotal: 3000 });
        this.reward.set({ kind: 'freeShipping' });
        break;
      case 'cartThreshold':
        this.scope.set('cart');
        this.minimum.set({ subtotal: 4000 });
        this.reward.set({ kind: 'amountOff', amount: 300 });
        break;
    }
  }

  onPercentChange(event: Event): void {
    const val = this.#readInt(event, 1);
    this.reward.set({ kind: 'percentOff', percent: Math.min(100, val) });
  }

  onAmountChange(event: Event): void {
    const val = this.#readInt(event, 1);
    this.reward.set({ kind: 'amountOff', amount: val });
  }

  onFixedPriceChange(event: Event): void {
    const val = this.#readInt(event, 0);
    this.reward.set({ kind: 'fixedPrice', price: val });
  }

  onMinSubtotalChange(event: Event): void {
    const val = this.#readInt(event, 0);
    this.minimum.set(val > 0 ? { subtotal: val } : null);
  }

  onCartRewardTypeChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.value === 'percentOff') {
      this.reward.set({ kind: 'percentOff', percent: 10 });
    } else {
      this.reward.set({ kind: 'amountOff', amount: 300 });
    }
  }

  onBuyXGetYChange(
    field: 'buyQty' | 'getQty' | 'getPercent' | 'maxApps',
    event: Event,
  ): void {
    const r = this.reward();
    if (r.kind !== 'buyXGetY') return;
    const raw = (event.target as HTMLInputElement).value.trim();
    const num = Number.parseInt(raw, 10);

    this.reward.set({
      ...r,
      buy: { quantity: field === 'buyQty' ? Math.max(1, num || 1) : r.buy.quantity },
      get: {
        quantity: field === 'getQty' ? Math.max(1, num || 1) : r.get.quantity,
        percent: field === 'getPercent' ? Math.min(100, Math.max(1, num || 100)) : r.get.percent,
      },
      maxApplications:
        field === 'maxApps' ? (Number.isFinite(num) && num > 0 ? num : null) : r.maxApplications,
    });
  }

  onTierChange(index: number, field: 'min' | 'percent', event: Event): void {
    const r = this.reward();
    if (r.kind !== 'tiered') return;
    const val = this.#readInt(event, 1);
    const nextTiers: OfferTier[] = r.tiers.map((tier, idx) =>
      idx === index
        ? {
            min: field === 'min' ? val : tier.min,
            percent: field === 'percent' ? Math.min(100, val) : (tier.percent ?? 10),
          }
        : tier,
    );
    this.reward.set({ ...r, tiers: nextTiers });
  }

  addTier(): void {
    const r = this.reward();
    if (r.kind !== 'tiered' || r.tiers.length >= 5) return;
    const last = r.tiers[r.tiers.length - 1];
    this.reward.set({
      ...r,
      tiers: [...r.tiers, { min: (last?.min ?? 1) + 2, percent: Math.min(100, (last?.percent ?? 10) + 5) }],
    });
  }

  removeTier(index: number): void {
    const r = this.reward();
    if (r.kind !== 'tiered' || r.tiers.length <= 2) return;
    this.reward.set({ ...r, tiers: r.tiers.filter((_, idx) => idx !== index) });
  }

  onGiftProductChange(event: Event): void {
    const r = this.reward();
    if (r.kind !== 'freeGift') return;
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.reward.set({ ...r, giftProductId: target.value });
  }

  #readInt(event: Event, fallback: number): number {
    const target = event.target as HTMLInputElement;
    const parsed = Number.parseInt(target.value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
