import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { AccountMenuComponent } from '../account-menu/account-menu.component';

@Component({
  imports: [
    SharedIconModule,
    MatBadgeModule,
    MatButtonModule,
    MatTooltipModule,
    AccountMenuComponent,
  ],
  selector: 'app-navbar-actions',
  templateUrl: './navbar-actions.component.html',
})
export class NavbarActionsComponent {
  readonly #drawerService = inject(DrawerService);
  readonly #cart = inject(CartService);
  readonly #router = inject(Router);
  readonly cartCount = this.#cart.count;

  toggleSearch(): void {
    void this.#router.navigate(['/search']);
  }

  toggleCart(): void {
    this.#drawerService.toggle('cart');
  }
}
