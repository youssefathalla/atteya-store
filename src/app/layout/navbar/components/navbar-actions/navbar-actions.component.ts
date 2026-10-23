import { Component, inject, signal } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
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
  readonly cartCount = signal<number>(2);

  toggleSearch(): void {
    console.log('Toggle search');
  }

  toggleCart(): void {
    this.#drawerService.toggle('cart');
  }
}
