import { Component, inject, signal } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { MatButtonModule } from '@angular/material/button';
import { DrawerService } from '../../core/services/drawer/drawer.service';
import { NavCategory } from '../models/nav.model';
import { NAV_CATEGORIES } from '../data/nav.data';
import { NavbarActionsComponent } from './components/navbar-actions/navbar-actions.component';
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

  // Categories for Desktop Navigation
  readonly categories = signal<readonly NavCategory[]>(NAV_CATEGORIES);

  onEscape(): void {
    this.drawerService.close();
  }
}
