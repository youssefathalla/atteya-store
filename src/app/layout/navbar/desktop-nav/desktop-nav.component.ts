import { Component, inject } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { MatButtonModule } from '@angular/material/button';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { NavService } from '../nav.service';
import { NavbarActionsComponent } from '../components/navbar-actions/navbar-actions.component';
import { NavLinksComponent } from './components/nav-links/nav-links.component';

@Component({
  selector: 'app-desktop-nav',
  imports: [
    SharedIconModule,
    NavbarActionsComponent,
    LogoComponent,
    NavLinksComponent,
    MatButtonModule,
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

  // Live categories signal from NavService
  readonly categories = this.#navService.categories;

  onEscape(): void {
    this.drawerService.close();
  }
}
