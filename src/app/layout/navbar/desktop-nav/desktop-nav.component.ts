import { Component, computed, inject } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { MatButtonModule } from '@angular/material/button';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { NavService } from '@core/services/navigation';
import { NavbarActionsComponent } from '../components/navbar-actions/navbar-actions.component';
import { NavLinksComponent } from './components/nav-links/nav-links.component';
import { SkeletonComponent } from '@shared/ui/skeleton/skeleton.component';
@Component({
  selector: 'app-desktop-nav',
  imports: [
    SharedIconModule,
    NavbarActionsComponent,
    LogoComponent,
    NavLinksComponent,
    MatButtonModule,
    SkeletonComponent,
  ],
  templateUrl: './desktop-nav.component.html',
  host: {
    class: 'hidden lg:block w-full sticky top-0 z-50',
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class DesktopNavComponent {
  readonly drawerService = inject(DrawerService);
  readonly #navService = inject(NavService);

  readonly categories = this.#navService.storefrontCategories;
  readonly showNavSkeleton = computed(() => !this.#navService.navLinksReady());

  onEscape(): void {
    this.drawerService.close();
  }
}
