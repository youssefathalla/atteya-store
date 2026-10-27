import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { CurrencyService } from '@core/services/currency/currency.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { formatMoney } from '@shared/utils/money';

@Component({
  selector: 'app-cart-drawer',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './cart-drawer.component.html',
  host: {
    class: 'h-full flex flex-col',
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class CartDrawerComponent {
  readonly drawerService = inject(DrawerService);
  readonly #currency = inject(CurrencyService);
  readonly subtotal = computed(() => {
    const entry = this.#currency.entry();
    return formatMoney(0, entry.code, entry.decimals);
  });

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
