import { Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAX_BUNDLE_PIECES,
  MAX_BUNDLE_ROWS,
  MAX_GIFT_CHOICES,
  MAX_GIFT_NAME,
  MAX_OFFER_GIFTS,
  type OfferBundleRow,
  type OfferGift,
  type OfferMinimum,
  type OfferReward,
  type OfferScope,
} from '@core/services/offers/engine';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  FREE_ITEM_OPTIONS,
  isUnavailableDeal,
  MAX_FREE_ITEM_VALUES,
  readFreeItem,
  REWARD_PICKER_OPTIONS,
  rewardPickerKind,
  UNAVAILABLE_DEAL_MESSAGE,
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

  readonly selectedPickerKind = computed<RewardPickerKind>(() =>
    rewardPickerKind(this.reward(), this.scope()),
  );

  /** An old offer of a deal type that is hidden for launch: it opens, but can't be saved. */
  readonly isUnavailableDeal = computed(() => isUnavailableDeal(this.reward(), this.scope()));
  readonly unavailableDealMessage = UNAVAILABLE_DEAL_MESSAGE;

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
      case 'bundlePrice':
        // An item offer with no minimum: the bag groups the qualifying pieces into the rows.
        this.scope.set('item');
        this.minimum.set(null);
        this.reward.set({ kind: 'bundlePrice', rows: [{ quantity: 2, price: 200 }] });
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
        // The minimum is optional: start empty so the offer covers every Egypt order unless staff type one.
        this.minimum.set(null);
        this.reward.set({ kind: 'freeShipping' });
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

  onBuyXGetYChange(field: 'buyQty' | 'getQty' | 'getPercent' | 'maxApps', event: Event): void {
    const r = this.reward();
    if (r.kind !== 'buyXGetY') return;
    const input = event.target as HTMLInputElement;
    const num = Number.parseInt(input.value.trim(), 10);
    // Buy, Get and Get % keep exactly what was typed (an empty field counts as 0), so a wrong
    // value shows the form's error instead of being changed behind the person's back.
    const typed = Number.isFinite(num) ? num : 0;
    // Max times: 0 or empty means no limit, and the field is shown empty.
    const maxApplications = Number.isFinite(num) && num > 0 ? num : null;
    if (field === 'maxApps' && maxApplications === null) input.value = '';

    this.reward.set({
      ...r,
      buy: { quantity: field === 'buyQty' ? typed : r.buy.quantity },
      get: {
        quantity: field === 'getQty' ? typed : r.get.quantity,
        percent: field === 'getPercent' ? typed : r.get.percent,
      },
      maxApplications: field === 'maxApps' ? maxApplications : r.maxApplications,
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
  readonly brandNames = computed(() => new Map(this.brands().map((brand) => [brand.id, brand.name])));

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
      !value || list.includes(value) || list.length >= MAX_FREE_ITEM_VALUES ? list : [...list, value],
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

  readonly maxBundleRows = MAX_BUNDLE_ROWS;
  readonly maxBundlePieces = MAX_BUNDLE_PIECES;

  /** + Add Row: the next number of pieces after the biggest row, total left empty to type. */
  addBundleRow(): void {
    this.#updateBundleRows((rows) => {
      if (rows.length >= MAX_BUNDLE_ROWS) return rows;
      const used = new Set(rows.map((row) => row.quantity));
      let quantity = Math.max(0, ...rows.map((row) => row.quantity)) + 1;
      while (used.has(quantity)) quantity++;
      if (quantity > MAX_BUNDLE_PIECES) {
        quantity = 1;
        while (used.has(quantity) && quantity < MAX_BUNDLE_PIECES) quantity++;
      }
      return [...rows, { quantity, price: 0 }];
    });
  }

  removeBundleRow(index: number): void {
    this.#updateBundleRows((rows) => rows.filter((_, at) => at !== index));
  }

  /**
   * Pieces keep exactly what was typed (empty counts as 0), so a wrong value shows the form's
   * error. The rows are sorted by pieces once the field is left (`change`), not while typing.
   */
  onBundlePiecesChange(index: number, event: Event): void {
    const quantity = this.#readTyped(event);
    this.#updateBundleRows((rows) =>
      rows
        .map((row, at) => (at === index ? { ...row, quantity } : row))
        .sort((a, b) => a.quantity - b.quantity),
    );
  }

  onBundlePriceChange(index: number, event: Event): void {
    const price = this.#readTyped(event);
    this.#updateBundleRows((rows) => rows.map((row, at) => (at === index ? { ...row, price } : row)));
  }

  #updateBundleRows(change: (rows: readonly OfferBundleRow[]) => readonly OfferBundleRow[]): void {
    const r = this.reward();
    if (r.kind !== 'bundlePrice') return;
    this.reward.set({ ...r, rows: change(r.rows) });
  }

  #readTyped(event: Event): number {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
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
