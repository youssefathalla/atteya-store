import { Component, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type {
  ShopBrandOption,
  ShopColorOption,
  ShopFilterState,
  ShopPlayerOption,
  ShopSizeOption,
  ShopTabId,
} from '../../models/shop.model';
import { ShopFiltersComponent } from '../shop-filters/shop-filters.component';

@Component({
  selector: 'app-shop-filters-drawer',
  host: { class: 'contents' },
  imports: [MatButtonModule, SharedIconModule, ShopFiltersComponent],
  templateUrl: './shop-filters-drawer.component.html',
})
export class ShopFiltersDrawerComponent {
  readonly open = input(false);
  readonly filters = model.required<ShopFilterState>();
  readonly tab = input.required<ShopTabId>();
  readonly brands = input.required<readonly ShopBrandOption[]>();
  readonly players = input<readonly ShopPlayerOption[]>([]);
  readonly sizes = input.required<readonly ShopSizeOption[]>();
  readonly colors = input.required<readonly ShopColorOption[]>();
  readonly showGender = input(false);
  readonly showSizes = input(false);
  readonly accessoriesSubOnly = input(false);

  readonly closed = output<void>();
}
