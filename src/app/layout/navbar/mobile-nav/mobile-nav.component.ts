import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { MobileMenuComponent } from './components/mobile-menu/mobile-menu.component';
import { CartDrawerComponent } from '../../cart-drawer/cart-drawer.component';
import { AccountMenuComponent } from '../components/account-menu/account-menu.component';
import { SearchPanelService } from '../../search-panel/services/search-panel.service';

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
  readonly #searchPanel = inject(SearchPanelService);

  private readonly menuToggle = viewChild.required<string, ElementRef<HTMLElement>>('menuToggle', {
    read: ElementRef,
  });

  readonly cartCount = this.#cart.count;

  readonly isMenuOpen = computed(() => this.#drawerService.isOpen('menu'));
  readonly isCartOpen = computed(() => this.#drawerService.isOpen('cart'));

  openSearch(event: Event): void {
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    void this.#searchPanel.open(trigger);
  }

  /** Search row in the phone menu: opening the panel closes the menu. */
  openSearchFromMenu(): void {
    void this.#searchPanel.open(this.menuToggle().nativeElement);
  }

  toggleCart(): void {
    this.#drawerService.toggle('cart');
  }

  toggleMenu(): void {
    this.#drawerService.toggle('menu');
  }
}
