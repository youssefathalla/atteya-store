import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { useBreakpoint } from '@shared/utils/breakpoint.utils';
import { DesktopNavComponent } from '../navbar/desktop-nav/desktop-nav.component';
import { MobileNavComponent } from '../navbar/mobile-nav/mobile-nav.component';
import { CartDrawerComponent } from '../cart-drawer/cart-drawer.component';
import { ShippingBannerComponent } from '@shared/components/shipping-banner/shipping-banner.component';
import { DrawerService } from '@core/services/drawer/drawer.service';

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    DesktopNavComponent,
    CartDrawerComponent,
    MobileNavComponent,
    ShippingBannerComponent,
  ],
  templateUrl: './main.component.html',
})
export class MainLayoutComponent {
  readonly drawerService = inject(DrawerService);
  readonly #router = inject(Router);
  readonly navigating = signal(false);

  // Responsive signal to differentiate desktop side drawer vs mobile bottom slide-up
  readonly isDesktop = useBreakpoint(1024);

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    this.#router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => this.navigating.set(true), 150);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        if (timer) clearTimeout(timer);
        timer = null;
        this.navigating.set(false);
      }
    });
  }
}
