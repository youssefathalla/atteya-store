import { Component, computed, inject } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { MobileMenuComponent } from './components/mobile-menu/mobile-menu.component';
import { CartDrawerComponent } from '../../cart-drawer/cart-drawer.component';
import { AccountMenuComponent } from '../components/account-menu/account-menu.component';

@Component({
  selector: 'app-mobile-nav',
  templateUrl: './mobile-nav.component.html',
  imports: [
    SharedIconModule,
    MatBadgeModule,
    MatButtonModule,
    LogoComponent,
    MobileMenuComponent,
    CartDrawerComponent,
    AccountMenuComponent,
  ],
})
export class MobileNavComponent {
  readonly #drawerService = inject(DrawerService);
  readonly #cart = inject(CartService);

  readonly cartCount = this.#cart.count;

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
