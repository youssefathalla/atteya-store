import { Component, computed, inject, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { DrawerService } from '../../../core/services/drawer/drawer.service';
import { MobileMenuComponent } from './components/mobile-menu/mobile-menu.component';
import { CartDrawerComponent } from '../../cart-drawer/cart-drawer.component';

import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-mobile-nav',
  templateUrl: './mobile-nav.component.html',
  imports: [
    RouterLink,
    SharedIconModule,
    MatBadgeModule,
    MatButtonModule,
    MatMenuModule,
    LogoComponent,
    MobileMenuComponent,
    CartDrawerComponent,
  ],
})
export class MobileNavComponent {
  readonly #drawerService = inject(DrawerService);

  // Cart item count (reactive signal)
  readonly cartCount = signal<number>(2);

  readonly isMenuOpen = computed(() => this.#drawerService.isOpen('menu'));
  readonly isCartOpen = computed(() => this.#drawerService.isOpen('cart'));

  toggleSearch(): void {
    console.log('Mobile nav: toggle search');
  }

  toggleCart(): void {
    this.#drawerService.toggle('cart');
  }

  toggleMenu(): void {
    this.#drawerService.toggle('menu');
  }
}
