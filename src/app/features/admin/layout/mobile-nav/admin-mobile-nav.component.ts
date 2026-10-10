import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AdminNavService } from '../admin-nav.service';

@Component({
  selector: 'app-admin-mobile-nav',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './admin-mobile-nav.component.html',
})
export class AdminMobileNavComponent {
  readonly #adminNavService = inject(AdminNavService);

  readonly isMenuOpen = this.#adminNavService.isMobileMenuOpen;

  toggleMenu(): void {
    this.#adminNavService.toggleMobileMenu();
  }
}
