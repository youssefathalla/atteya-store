import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import type { ShopTab, ShopTabId } from '../../models/shop.model';

@Component({
  selector: 'app-shop-header',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule, SharedIconModule, SkeletonComponent],
  templateUrl: './shop-header.component.html',
})
export class ShopHeaderComponent {
  /** Empty while the title is still loading (an offer's name): a placeholder shows instead. */
  readonly title = input.required<string>();
  /** One line under the title, e.g. "The cheapest one is free." on an offer's page. */
  readonly subtitle = input<string | null>(null);
  readonly activeTab = input.required<ShopTabId>();
  /** All + the shown top-level categories (`shopTabsFrom()`). */
  readonly tabs = input.required<readonly ShopTab[]>();
  readonly filtersOpen = input(false);
  readonly resultCount = input<number | null>(null);
  readonly showFiltersToggle = input(true);

  readonly filtersToggle = output<void>();

  readonly resultsLabel = computed(() => {
    const count = this.resultCount();
    if (count === null) return null;
    const n = new Intl.NumberFormat('en-GB').format(count);
    return `${n} ${count === 1 ? 'result' : 'results'}`;
  });
}
