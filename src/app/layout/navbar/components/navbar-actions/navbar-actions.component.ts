import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { AccountMenuComponent } from '../account-menu/account-menu.component';
import { CurrencySwitcherComponent } from '../currency-switcher/currency-switcher.component';

@Component({
  imports: [
    SharedIconModule,
    MatBadgeModule,
    MatButtonModule,
    MatTooltipModule,
    AccountMenuComponent,
    CurrencySwitcherComponent,
  ],
  selector: 'app-navbar-actions',
  templateUrl: './navbar-actions.component.html',
})
export class NavbarActionsComponent {
  readonly #drawerService = inject(DrawerService);
  readonly #router = inject(Router);
  readonly cartCount = signal<number>(2);

  toggleSearch(): void {
    void this.#router.navigate(['/search']);
  }

  toggleCart(): void {
    this.#drawerService.toggle('cart');
  }
}
