import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SHOP_TABS, type ShopTabId } from '../../models/shop.model';

@Component({
  selector: 'app-shop-header',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './shop-header.component.html',
})
export class ShopHeaderComponent {
  readonly title = input.required<string>();
  readonly activeTab = input.required<ShopTabId>();
  readonly filtersOpen = input(false);
  readonly resultCount = input<number | null>(null);
  readonly showFiltersToggle = input(true);

  readonly filtersToggle = output<void>();

  readonly tabs = SHOP_TABS;

  readonly resultsLabel = computed(() => {
    const count = this.resultCount();
    if (count === null) return null;
    const n = new Intl.NumberFormat('en-GB').format(count);
    return `${n} ${count === 1 ? 'result' : 'results'}`;
  });
}
