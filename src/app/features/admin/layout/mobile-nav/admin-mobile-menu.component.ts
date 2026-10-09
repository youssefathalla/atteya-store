import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AdminNavService } from '../admin-nav.service';
import { AdminNavCategory } from '../admin-nav.model';

@Component({
  selector: 'app-admin-mobile-menu',
  imports: [RouterLink, RouterLinkActive, MatButtonModule, SharedIconModule],
  templateUrl: './admin-mobile-menu.component.html',
  host: {
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class AdminMobileMenuComponent {
  readonly #navService = inject(AdminNavService);

  readonly categories = this.#navService.categories;
  readonly isOpen = this.#navService.isMobileMenuOpen;
  readonly selectedCategory = this.#navService.selectedCategory;

  onEscape(): void {
    if (this.isOpen()) {
      this.closeMenu();
    }
  }

  selectCategory(category: AdminNavCategory): void {
    if (category.subItems && category.subItems.length > 0) {
      this.#navService.selectCategory(category);
    } else if (category.path) {
      this.closeMenu();
    }
  }

  goBack(): void {
    this.#navService.goBack();
  }

  closeMenu(): void {
    this.#navService.closeMobileMenu();
  }
}
