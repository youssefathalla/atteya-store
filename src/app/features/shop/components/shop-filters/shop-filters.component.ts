import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import type { ColorId } from '@core/services/products/catalog-taxonomy';
import { formatMoney } from '@shared/utils/money';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import {
  SHOP_CATEGORY_OPTIONS,
  SHOP_GENDER_OPTIONS,
  SHOP_SORT_OPTIONS,
  type ShopBrandOption,
  type ShopCategoryFilterId,
  type ShopColorOption,
  type ShopFilterState,
  type ShopGenderFilterId,
  type ShopPriceBounds,
  type ShopSizeOption,
  type ShopTabId,
} from '../../models/shop.model';
import { toggleListValue } from '../../utils/shop-filters';

/** Debounce after the last thumb move before writing the URL / browsing. */
const PRICE_COMMIT_MS = 180;

@Component({
  selector: 'app-shop-filters',
  host: { class: 'block w-full' },
  imports: [MatCheckboxModule, MatRadioModule, MatSliderModule, ColorSwatchComponent],
  templateUrl: './shop-filters.component.html',
})
export class ShopFiltersComponent {
  readonly filters = model.required<ShopFilterState>();
  readonly tab = input.required<ShopTabId>();
  readonly brands = input.required<readonly ShopBrandOption[]>();
  readonly sizes = input.required<readonly ShopSizeOption[]>();
  readonly colors = input.required<readonly ShopColorOption[]>();
  readonly priceBounds = input.required<ShopPriceBounds>();
  readonly showGender = input(false);
  readonly showSizes = input(false);
  /** When true, only Bags is offered under Category (Accessories tab). */
  readonly accessoriesSubOnly = input(false);

  readonly sortOptions = SHOP_SORT_OPTIONS;
  readonly genderOptions = SHOP_GENDER_OPTIONS;

  /** Local drafts so thumbs move smoothly while the URL catches up. */
  readonly draftMin = signal(0);
  readonly draftMax = signal(0);

  readonly #destroyRef = inject(DestroyRef);
  #priceTimer: ReturnType<typeof setTimeout> | null = null;
  #priceDragging = false;

  readonly categoryOptions = computed(() => {
    if (this.accessoriesSubOnly()) {
      return SHOP_CATEGORY_OPTIONS.filter((o) => o.id === 'bags');
    }
    if (this.tab() !== 'all') return [];
    return SHOP_CATEGORY_OPTIONS;
  });

  readonly showCategorySection = computed(() => this.categoryOptions().length > 0);

  readonly priceMinLabel = computed(() => formatMoney(this.draftMin(), 'EGP', 0));
  readonly priceMaxLabel = computed(() => formatMoney(this.draftMax(), 'EGP', 0));

  readonly displayPrice = (value: number): string => formatMoney(value, 'EGP', 0);

  constructor() {
    effect(() => {
      const bounds = this.priceBounds();
      const state = this.filters();
      if (this.#priceDragging) return;
      this.draftMin.set(state.priceMin ?? bounds.min);
      this.draftMax.set(state.priceMax ?? bounds.max);
    });

    this.#destroyRef.onDestroy(() => {
      if (this.#priceTimer !== null) clearTimeout(this.#priceTimer);
    });
  }

  setSort(sort: ShopFilterState['sort']): void {
    this.#emit({ ...this.filters(), sort, page: 0 });
  }

  toggleCategory(id: ShopCategoryFilterId): void {
    this.#emit({
      ...this.filters(),
      categories: toggleListValue(this.filters().categories, id),
      page: 0,
    });
  }

  toggleBrand(name: string): void {
    this.#emit({
      ...this.filters(),
      brands: toggleListValue(this.filters().brands, name),
      page: 0,
    });
  }

  toggleSize(label: string): void {
    this.#emit({
      ...this.filters(),
      sizes: toggleListValue(this.filters().sizes, label),
      page: 0,
    });
  }

  toggleColor(id: ColorId): void {
    this.#emit({
      ...this.filters(),
      colors: toggleListValue(this.filters().colors, id),
      page: 0,
    });
  }

  toggleGender(id: ShopGenderFilterId): void {
    this.#emit({
      ...this.filters(),
      genders: toggleListValue(this.filters().genders, id),
      page: 0,
    });
  }

  setOnSale(checked: boolean): void {
    this.#emit({ ...this.filters(), onSale: checked, page: 0 });
  }

  setInStock(checked: boolean): void {
    this.#emit({ ...this.filters(), inStock: checked, page: 0 });
  }

  onPriceMinInput(value: number): void {
    if (!Number.isFinite(value)) return;
    this.#priceDragging = true;
    this.draftMin.set(Math.min(value, this.draftMax()));
    this.#schedulePriceCommit();
  }

  onPriceMaxInput(value: number): void {
    if (!Number.isFinite(value)) return;
    this.#priceDragging = true;
    this.draftMax.set(Math.max(value, this.draftMin()));
    this.#schedulePriceCommit();
  }

  onPriceDragEnd(): void {
    this.#flushPriceCommit();
  }

  #schedulePriceCommit(): void {
    if (this.#priceTimer !== null) clearTimeout(this.#priceTimer);
    this.#priceTimer = setTimeout(() => this.#flushPriceCommit(), PRICE_COMMIT_MS);
  }

  #flushPriceCommit(): void {
    if (this.#priceTimer !== null) {
      clearTimeout(this.#priceTimer);
      this.#priceTimer = null;
    }
    const bounds = this.priceBounds();
    const min = this.draftMin();
    const max = this.draftMax();
    this.#priceDragging = false;
    this.#emit({
      ...this.filters(),
      priceMin: min <= bounds.min ? null : min,
      priceMax: max >= bounds.max ? null : max,
      page: 0,
    });
  }

  #emit(next: ShopFilterState): void {
    this.filters.set(next);
  }
}
