import { Component, computed, input, model } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
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

@Component({
  selector: 'app-shop-filters',
  host: { class: 'block w-full' },
  imports: [MatCheckboxModule, MatRadioModule, ColorSwatchComponent],
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

  readonly categoryOptions = computed(() => {
    if (this.accessoriesSubOnly()) {
      return SHOP_CATEGORY_OPTIONS.filter((o) => o.id === 'bags');
    }
    if (this.tab() !== 'all') return [];
    return SHOP_CATEGORY_OPTIONS;
  });

  readonly showCategorySection = computed(() => this.categoryOptions().length > 0);

  readonly priceMinLabel = computed(() =>
    formatMoney(this.filters().priceMin ?? this.priceBounds().min, 'EGP', 0),
  );
  readonly priceMaxLabel = computed(() =>
    formatMoney(this.filters().priceMax ?? this.priceBounds().max, 'EGP', 0),
  );

  readonly draftMin = computed(
    () => this.filters().priceMin ?? this.priceBounds().min,
  );
  readonly draftMax = computed(
    () => this.filters().priceMax ?? this.priceBounds().max,
  );

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

  onPriceMinInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    const max = this.draftMax();
    const next = Math.min(value, max);
    const bounds = this.priceBounds();
    this.#emit({
      ...this.filters(),
      priceMin: next <= bounds.min ? null : next,
      page: 0,
    });
  }

  onPriceMaxInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    const min = this.draftMin();
    const next = Math.max(value, min);
    const bounds = this.priceBounds();
    this.#emit({
      ...this.filters(),
      priceMax: next >= bounds.max ? null : next,
      page: 0,
    });
  }

  #emit(next: ShopFilterState): void {
    this.filters.set(next);
  }
}
