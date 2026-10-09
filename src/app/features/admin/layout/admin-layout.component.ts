import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@layout/navbar/nav.service';
import { AdminNavService } from './admin-nav.service';
import { AdminMobileNavComponent } from './mobile-nav/admin-mobile-nav.component';
import { AdminMobileMenuComponent } from './mobile-nav/admin-mobile-menu.component';

@Component({
  selector: 'app-admin-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    SharedIconModule,
    AdminMobileNavComponent,
    AdminMobileMenuComponent,
  ],
  templateUrl: './admin-layout.component.html',
  host: {
    class: 'block min-h-screen bg-surface-container-lowest',
  },
})
export class AdminLayoutComponent {
  readonly navService = inject(NavService);
  readonly adminNavService = inject(AdminNavService);

  readonly adminCategories = this.adminNavService.categories;
}
