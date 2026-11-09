import { Component, inject } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SearchPanelService } from '../../../search-panel/services/search-panel.service';
import { AccountMenuComponent } from '../account-menu/account-menu.component';

@Component({
  imports: [SharedIconModule, MatBadgeModule, MatButtonModule, MatTooltipModule, AccountMenuComponent],
  selector: 'app-navbar-actions',
  templateUrl: './navbar-actions.component.html',
})
export class NavbarActionsComponent {
  readonly #drawerService = inject(DrawerService);
  readonly #cart = inject(CartService);
  readonly #searchPanel = inject(SearchPanelService);
  readonly cartCount = this.#cart.count;

  openSearch(event: Event): void {
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    void this.#searchPanel.open(trigger);
  }

  toggleCart(): void {
    this.#drawerService.toggle('cart');
  }
}
