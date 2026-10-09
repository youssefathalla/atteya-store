import { Component, inject, signal } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DrawerService } from '@core/services/drawer/drawer.service';

import { RouterLink } from '@angular/router';

@Component({
  imports: [
    RouterLink,
    SharedIconModule,
    MatBadgeModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
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
