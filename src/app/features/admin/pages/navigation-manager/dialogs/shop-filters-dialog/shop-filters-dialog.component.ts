import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {
  NAV_SHOP_CATEGORY_IDS,
  NAV_SHOP_CATEGORY_LABELS,
  type NavShopCategoryId,
  type NavShopFilters,
  type NavShopGender,
} from '@core/services/navigation';
import { PlayerListService } from '@core/services/products/player-list.service';
import type { NavPickEntry } from '../../services/navigation-catalog.service';

export interface ShopFiltersDialogData {
  readonly filters: NavShopFilters;
  readonly brands: readonly NavPickEntry[];
}

/** Picks the Shop filters a navigation link opens (`/shop?brand=…&onSale=1`). */
@Component({
  selector: 'app-shop-filters-dialog',
  templateUrl: './shop-filters-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
})
export class ShopFiltersDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<ShopFiltersDialogComponent, NavShopFilters | null>);
  readonly data = inject<ShopFiltersDialogData>(MAT_DIALOG_DATA);
  readonly #players = inject(PlayerListService);

  readonly players = this.#players.players;
  readonly categories = NAV_SHOP_CATEGORY_IDS.map((id) => ({ id, label: NAV_SHOP_CATEGORY_LABELS[id] }));
  readonly genders: readonly { id: NavShopGender; label: string }[] = [
    { id: 'women', label: 'Women' },
    { id: 'men', label: 'Men' },
  ];

  readonly brand = signal<string | null>(this.data.filters.brand ?? null);
  readonly player = signal<string | null>(this.data.filters.player ?? null);
  readonly category = signal<NavShopCategoryId | null>(this.data.filters.category ?? null);
  readonly gender = signal<NavShopGender | null>(this.data.filters.gender ?? null);
  readonly onSale = signal<boolean>(this.data.filters.onSale ?? false);
  readonly newArrivals = signal<boolean>(this.data.filters.newArrivals ?? false);

  readonly filters = computed<NavShopFilters>(() => ({
    ...(this.brand() ? { brand: this.brand()! } : {}),
    ...(this.player() ? { player: this.player()! } : {}),
    ...(this.category() ? { category: this.category()! } : {}),
    ...(this.gender() ? { gender: this.gender()! } : {}),
    ...(this.onSale() ? { onSale: true } : {}),
    ...(this.newArrivals() ? { newArrivals: true } : {}),
  }));

  submit(): void {
    this.#dialogRef.close(this.filters());
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
