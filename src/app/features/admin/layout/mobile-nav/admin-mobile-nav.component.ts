import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@layout/navbar/nav.service';
import { AdminNavService } from '../admin-nav.service';

@Component({
  selector: 'app-admin-mobile-nav',
  imports: [RouterLink, RouterLinkActive, MatButtonModule, SharedIconModule],
  templateUrl: './admin-mobile-nav.component.html',
})
export class AdminMobileNavComponent {
  readonly #adminNavService = inject(AdminNavService);
  readonly #navService = inject(NavService);

  readonly isMenuOpen = this.#adminNavService.isMobileMenuOpen;
  readonly isLive = this.#navService.isLive;

  toggleMenu(): void {
    this.#adminNavService.toggleMobileMenu();
  }
}
