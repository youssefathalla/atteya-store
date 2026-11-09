import { Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAX_GIFT_CHOICES,
  MAX_GIFT_NAME,
  MAX_OFFER_GIFTS,
  type OfferGift,
  type OfferMinimum,
  type OfferReward,
  type OfferScope,
  type OfferTier,
} from '@core/services/offers/engine';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  FREE_ITEM_OPTIONS,
  MAX_FREE_ITEM_VALUES,
  readFreeItem,
  REWARD_PICKER_OPTIONS,
  type FreeItemMode,
  type RewardPickerKind,
  withFreeItem,
} from '../../models/offer-admin.model';

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
  readonly categories = input<readonly Category[]>([]);
  readonly brands = input<readonly Brand[]>([]);

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
        // One set of gifts per qualifying item bought, so it is an item offer with no minimum.
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({
          kind: 'freeGift',
          gifts: [{ id: 'gift-1', name: 'Free gift', productIds: [] }],
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

  readonly freeItemOptions = FREE_ITEM_OPTIONS;

  /** The saved "Which item is free?" choice, read back from the reward. */
  readonly freeItem = computed(() => {
    const r = this.reward();
    return r.kind === 'buyXGetY' ? readFreeItem(r) : null;
  });

  readonly categoryNames = computed(
    () => new Map(this.categories().map((category) => [category.id, category.name])),
  );
  readonly brandNames = computed(
    () => new Map(this.brands().map((brand) => [brand.id, brand.name])),
  );

  onFreeItemModeChange(mode: FreeItemMode): void {
    const r = this.reward();
    const current = this.freeItem();
    if (r.kind !== 'buyXGetY' || !current || current.mode === mode) return;
    this.reward.set(withFreeItem(r, mode, current.selection));
  }

  addFreeItemValue(kind: 'productIds' | 'categoryIds' | 'brandIds', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    target.value = '';
    this.#changeFreeItem(kind, (list) =>
      !value || list.includes(value) || list.length >= MAX_FREE_ITEM_VALUES
        ? list
        : [...list, value],
    );
  }

  removeFreeItemValue(kind: 'productIds' | 'categoryIds' | 'brandIds', value: string): void {
    this.#changeFreeItem(kind, (list) => list.filter((id) => id !== value));
  }

  onRepeatChange(repeat: boolean): void {
    const r = this.reward();
    if (r.kind !== 'buyXGetY') return;
    this.reward.set({ ...r, repeat });
  }

  #changeFreeItem(
    kind: 'productIds' | 'categoryIds' | 'brandIds',
    change: (list: readonly string[]) => readonly string[],
  ): void {
    const r = this.reward();
    const current = this.freeItem();
    if (r.kind !== 'buyXGetY' || !current) return;
    this.reward.set(
      withFreeItem(r, current.mode, { ...current.selection, [kind]: change(current.selection[kind]) }),
    );
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

  readonly maxGifts = MAX_OFFER_GIFTS;
  readonly maxGiftChoices = MAX_GIFT_CHOICES;
  readonly maxGiftName = MAX_GIFT_NAME;

  readonly productNames = computed(
    () => new Map(this.products().map((product) => [product.id, product.name])),
  );

  addGift(): void {
    this.#updateGifts((gifts) => {
      if (gifts.length >= MAX_OFFER_GIFTS) return gifts;
      const used = new Set(gifts.map((gift) => gift.id));
      let index = gifts.length + 1;
      while (used.has(`gift-${index}`)) index++;
      return [...gifts, { id: `gift-${index}`, name: '', productIds: [] }];
    });
  }

  removeGift(giftId: string): void {
    this.#updateGifts((gifts) => gifts.filter((gift) => gift.id !== giftId));
  }

  onGiftNameChange(giftId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.slice(0, MAX_GIFT_NAME);
    this.#updateGift(giftId, (gift) => ({ ...gift, name: value }));
  }

  onGiftChoiceAdd(giftId: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const productId = target.value;
    target.value = '';
    if (!productId) return;
    this.#updateGift(giftId, (gift) =>
      gift.productIds.includes(productId) || gift.productIds.length >= MAX_GIFT_CHOICES
        ? gift
        : { ...gift, productIds: [...gift.productIds, productId] },
    );
  }

  removeGiftChoice(giftId: string, productId: string): void {
    this.#updateGift(giftId, (gift) => ({
      ...gift,
      productIds: gift.productIds.filter((id) => id !== productId),
    }));
  }

  #updateGift(giftId: string, change: (gift: OfferGift) => OfferGift): void {
    this.#updateGifts((gifts) => gifts.map((gift) => (gift.id === giftId ? change(gift) : gift)));
  }

  #updateGifts(change: (gifts: readonly OfferGift[]) => readonly OfferGift[]): void {
    const r = this.reward();
    if (r.kind !== 'freeGift') return;
    this.reward.set({ ...r, gifts: change(r.gifts) });
  }

  #readInt(event: Event, fallback: number): number {
    const target = event.target as HTMLInputElement;
    const parsed = Number.parseInt(target.value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
