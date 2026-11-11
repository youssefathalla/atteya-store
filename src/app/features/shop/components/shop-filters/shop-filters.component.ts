import { Component, computed, input, model } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import type { ColorId } from '@core/services/products/catalog-taxonomy';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  SHOP_CATEGORY_OPTIONS,
  SHOP_GENDER_OPTIONS,
  SHOP_SORT_OPTIONS,
  type ShopBrandOption,
  type ShopCategoryFilterId,
  type ShopColorOption,
  type ShopFilterState,
  type ShopGenderFilterId,
  type ShopPlayerOption,
  type ShopSizeOption,
  type ShopTabId,
} from '../../models/shop.model';
import { toggleListValue } from '../../utils/shop-filters';

@Component({
  selector: 'app-shop-filters',
  host: { class: 'block w-full' },
  imports: [MatCheckboxModule, MatRadioModule, ColorSwatchComponent, SharedIconModule],
  templateUrl: './shop-filters.component.html',
})
export class ShopFiltersComponent {
  readonly filters = model.required<ShopFilterState>();
  readonly tab = input.required<ShopTabId>();
  readonly brands = input.required<readonly ShopBrandOption[]>();
  readonly players = input<readonly ShopPlayerOption[]>([]);
  readonly sizes = input.required<readonly ShopSizeOption[]>();
  readonly colors = input.required<readonly ShopColorOption[]>();
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

  togglePlayer(id: string): void {
    this.#emit({
      ...this.filters(),
      players: toggleListValue(this.filters().players, id),
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

  setNewArrivals(checked: boolean): void {
    this.#emit({ ...this.filters(), newArrivals: checked, page: 0 });
  }

  setOnSale(checked: boolean): void {
    this.#emit({ ...this.filters(), onSale: checked, page: 0 });
  }

  setInStock(checked: boolean): void {
    this.#emit({ ...this.filters(), inStock: checked, page: 0 });
  }

  #emit(next: ShopFilterState): void {
    this.filters.set(next);
  }
}
