import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { useBreakpoint } from '@shared/utils/breakpoint.utils';
import { AdminNavService } from './admin-nav.service';
import { AdminSidebarComponent } from './sidebar/admin-sidebar.component';
import { AdminHeaderComponent } from './header/admin-header.component';
import { AdminMobileNavComponent } from './mobile-nav/admin-mobile-nav.component';
import { AdminMobileMenuComponent } from './mobile-nav/admin-mobile-menu.component';

@Component({
  selector: 'app-admin-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    AdminSidebarComponent,
    AdminHeaderComponent,
    AdminMobileNavComponent,
    AdminMobileMenuComponent,
  ],
  templateUrl: './admin-layout.component.html',
  host: {
    class: 'block min-h-screen bg-surface-container-lowest',
  },
})
export class AdminLayoutComponent {
  readonly adminNavService = inject(AdminNavService);

  readonly adminCategories = this.adminNavService.categories;
  readonly isDesktopSidebarOpen = this.adminNavService.isDesktopSidebarOpen;
  readonly currentPageTitle = this.adminNavService.currentPageTitle;

  readonly isDesktop = useBreakpoint(1280);

  toggleDesktopSidebar(): void {
    this.adminNavService.toggleDesktopSidebar();
  }

  onDesktopSidebarOpenedChange(open: boolean): void {
    if (this.isDesktop()) {
      this.adminNavService.setDesktopSidebarOpen(open);
    }
  }
}
