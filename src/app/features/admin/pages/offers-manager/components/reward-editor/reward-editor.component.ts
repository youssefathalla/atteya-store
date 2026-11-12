import { Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import {
  MAX_BUNDLE_PIECES,
  MAX_BUNDLE_ROWS,
  MAX_BUNDLE_SET_PERCENT,
  MAX_BUNDLE_SLOT_NAME,
  MAX_BUNDLE_SLOT_PIECES,
  MIN_BUNDLE_SLOTS,
  MAX_GIFT_CHOICES,
  MAX_GIFT_NAME,
  MAX_OFFER_GIFTS,
  type OfferBundleRow,
  type OfferBundleSetReward,
  type OfferBundleSlot,
  type OfferConditions,
  type OfferGift,
  type OfferIssue,
  type OfferMinimum,
  type OfferReward,
  type OfferScope,
} from '@core/services/offers/engine';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ProductTargetsComponent } from '../product-targets/product-targets.component';
import {
  BUNDLE_QUICK_PERCENTS,
  BUNDLE_SAVING_OPTIONS,
  bundleSetIssueField,
  canAddBundleSlot,
  newBundleSlot,
  type BundleSetIssueField,
  type CatalogNames,
  FREE_ITEM_OPTIONS,
  isUnavailableDeal,
  MAX_FREE_ITEM_VALUES,
  QUICK_PERCENTS,
  readFreeItem,
  rewardPickerKind,
  UNAVAILABLE_DEAL_MESSAGE,
  type FreeItemMode,
  type RewardPickerKind,
  withFreeItem,
} from '../../models/offer-admin.model';

@Component({
  selector: 'app-reward-editor',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    ProductTargetsComponent,
    SharedIconModule,
  ],
  templateUrl: './reward-editor.component.html',
})
export class RewardEditorComponent {
  readonly reward = model.required<OfferReward>();
  readonly scope = model.required<OfferScope>();
  readonly minimum = model.required<OfferMinimum | null>();
  readonly products = input.required<readonly Product[]>();
  readonly categories = input<readonly Category[]>([]);
  readonly brands = input<readonly Brand[]>([]);
  /** The step's errors from `validateOffer()`; the Bundle & Save form shows its own under each part. */
  readonly issues = input<readonly OfferIssue[]>([]);

  readonly selectedPickerKind = computed<RewardPickerKind>(() =>
    rewardPickerKind(this.reward(), this.scope()),
  );

  /** An old offer of a deal type that is hidden for launch: it opens, but can't be saved. */
  readonly isUnavailableDeal = computed(() => isUnavailableDeal(this.reward(), this.scope()));
  readonly unavailableDealMessage = UNAVAILABLE_DEAL_MESSAGE;

  readonly quickPercents = QUICK_PERCENTS;

  onPercentChange(event: Event): void {
    const val = this.#readInt(event, 1);
    this.reward.set({ kind: 'percentOff', percent: Math.min(100, val) });
  }

  setPercent(percent: number): void {
    this.reward.set({ kind: 'percentOff', percent });
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

  addFreeItemValue(kind: 'productIds' | 'categoryIds' | 'brandIds', event: MatSelectChange): void {
    const value = typeof event.value === 'string' ? event.value : '';
    event.source.value = null;
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
   * error. The row stays where it is: sorting here would move it before the next click or tab
   * lands, so that click would hit another row (`onBundleRowsFocusOut` sorts instead).
   */
  onBundlePiecesChange(index: number, event: Event): void {
    const quantity = this.#readTyped(event);
    this.#updateBundleRows((rows) => rows.map((row, at) => (at === index ? { ...row, quantity } : row)));
  }

  /**
   * Sorts the rows by pieces once focus has moved to something else outside the list (not when it
   * moves between rows). With no next target (a click on a button in Safari, or on empty space) it
   * waits, because sorting then would move a row from under the pointer before the click lands;
   * the pricing engine sorts the rows itself, so the saved order never matters.
   */
  onBundleRowsFocusOut(event: FocusEvent): void {
    const list = event.currentTarget as HTMLElement;
    const next = event.relatedTarget;
    if (!(next instanceof Node) || list.contains(next)) return;
    this.#updateBundleRows((rows) => {
      const sorted = [...rows].sort((a, b) => a.quantity - b.quantity);
      return sorted.every((row, at) => row === rows[at]) ? rows : sorted;
    });
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

  /** What was typed, decimals kept (empty or not a number = 0), so a wrong value shows the form's error. */
  #readTyped(event: Event): number {
    const value = (event.target as HTMLInputElement).value.trim();
    const parsed = value === '' ? 0 : Number(value);
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

  onGiftChoiceAdd(giftId: string, event: MatSelectChange): void {
    const productId = typeof event.value === 'string' ? event.value : '';
    event.source.value = null;
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

  // -------------------------------------------------------------------------------------------
  // Bundle & Save (ATS-253)
  // -------------------------------------------------------------------------------------------

  readonly maxSlotName = MAX_BUNDLE_SLOT_NAME;
  readonly maxSlotPieces = MAX_BUNDLE_SLOT_PIECES;
  readonly minSlots = MIN_BUNDLE_SLOTS;
  readonly maxSetPercent = MAX_BUNDLE_SET_PERCENT;
  readonly bundleQuickPercents = BUNDLE_QUICK_PERCENTS;
  readonly bundleSavingOptions = BUNDLE_SAVING_OPTIONS;

  /** Names for the group tag pickers; the page passes the ones it already built. */
  readonly names = input.required<CatalogNames>();

  /** Errors for each part of the Bundle & Save form (groups, saving, limit). */
  readonly bundleIssues = computed(() => {
    const byField: Record<BundleSetIssueField, string[]> = { groups: [], saving: [], limit: [] };
    for (const issue of this.issues()) {
      const field = bundleSetIssueField(issue.code);
      if (field) byField[field].push(issue.message);
    }
    return byField;
  });

  readonly canAddSlot = computed(() => {
    const r = this.reward();
    return r.kind === 'bundleSet' && canAddBundleSlot(r.slots);
  });

  addSlot(): void {
    this.#updateSlots((slots) => (canAddBundleSlot(slots) ? [...slots, newBundleSlot(slots)] : slots));
  }

  removeSlot(slotId: string): void {
    this.#updateSlots((slots) =>
      slots.length <= MIN_BUNDLE_SLOTS ? slots : slots.filter((slot) => slot.id !== slotId),
    );
  }

  onSlotNameChange(slotId: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value.slice(0, MAX_BUNDLE_SLOT_NAME);
    this.#updateSlot(slotId, (slot) => ({ ...slot, name }));
  }

  /** Pieces keep what was typed (empty = 0), so a wrong value shows the form's error. */
  onSlotPiecesChange(slotId: string, event: Event): void {
    const quantity = this.#readTyped(event);
    this.#updateSlot(slotId, (slot) => ({ ...slot, quantity }));
  }

  onSlotConditionsChange(slotId: string, conditions: OfferConditions): void {
    this.#updateSlot(slotId, (slot) => ({ ...slot, conditions }));
  }

  /** Picking another saving starts it from a sensible value (a price or amount is left to type). */
  onSavingTypeChange(type: OfferBundleSetReward['type']): void {
    const r = this.reward();
    if (r.kind !== 'bundleSet' || r.setReward.type === type) return;
    const setReward: OfferBundleSetReward =
      type === 'percent'
        ? { type, percent: 10 }
        : type === 'amount'
          ? { type, amount: 0 }
          : type === 'cheapestFree'
            ? { type }
            : { type: 'total', price: 0 };
    this.reward.set({ ...r, setReward });
  }

  onSetPriceChange(event: Event): void {
    this.#updateSetReward({ type: 'total', price: this.#readTyped(event) });
  }

  onSetPercentChange(event: Event): void {
    this.#updateSetReward({ type: 'percent', percent: this.#readTyped(event) });
  }

  setBundlePercent(percent: number): void {
    this.#updateSetReward({ type: 'percent', percent });
  }

  onSetAmountChange(event: Event): void {
    this.#updateSetReward({ type: 'amount', amount: this.#readTyped(event) });
  }

  /** On: at most 1 set per order to start with; off: no limit. */
  onLimitSetsChange(limit: boolean): void {
    const r = this.reward();
    if (r.kind !== 'bundleSet') return;
    this.reward.set({ ...r, maxSets: limit ? (r.maxSets ?? 1) : null });
  }

  onMaxSetsChange(event: Event): void {
    const r = this.reward();
    if (r.kind !== 'bundleSet' || r.maxSets === null) return;
    this.reward.set({ ...r, maxSets: this.#readTyped(event) });
  }

  #updateSetReward(setReward: OfferBundleSetReward): void {
    const r = this.reward();
    if (r.kind !== 'bundleSet') return;
    this.reward.set({ ...r, setReward });
  }

  #updateSlot(slotId: string, change: (slot: OfferBundleSlot) => OfferBundleSlot): void {
    this.#updateSlots((slots) => slots.map((slot) => (slot.id === slotId ? change(slot) : slot)));
  }

  #updateSlots(change: (slots: readonly OfferBundleSlot[]) => readonly OfferBundleSlot[]): void {
    const r = this.reward();
    if (r.kind !== 'bundleSet') return;
    this.reward.set({ ...r, slots: change(r.slots) });
  }

  #readInt(event: Event, fallback: number): number {
    const target = event.target as HTMLInputElement;
    const parsed = Number.parseInt(target.value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
