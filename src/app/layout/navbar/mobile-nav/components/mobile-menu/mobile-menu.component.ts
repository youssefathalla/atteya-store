import { Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AuthService } from '@core/services/auth/auth.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { NavCategory, NavService } from '@core/services/navigation';
import { SearchPanelService } from '../../../../search-panel/services/search-panel.service';

@Component({
  selector: 'app-mobile-menu',
  imports: [RouterLink, LinkTargetPipe, MatButtonModule, SharedIconModule],
  templateUrl: './mobile-menu.component.html',
  host: {
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class MobileMenuComponent {
  readonly drawerService = inject(DrawerService);
  readonly #navService = inject(NavService);
  readonly #auth = inject(AuthService);
  readonly #searchPanel = inject(SearchPanelService);
  readonly categories = this.#navService.storefrontCategories;
  /** The design playground is admin-only, so its link shows only for admins. */
  readonly isAdmin = this.#auth.isAdmin;

  // Reactive bottom sheet open state
  readonly isOpen = computed(() => this.drawerService.isOpen('menu'));

  // Drill-down level 2 selection (resets automatically when sheet closes)
  readonly selectedCategory = linkedSignal<boolean, NavCategory | null>({
    source: this.isOpen,
    computation: (open, prev) => (open ? (prev?.value ?? null) : null),
  });

  onEscape(): void {
    if (this.isOpen()) {
      this.closeMenu();
    }
  }

  selectCategory(category: NavCategory): void {
    if (category.megaMenu && category.megaMenu.length > 0) {
      this.selectedCategory.set(category);
    } else if (category.path) {
      this.drawerService.close();
    }
  }

  goBack(): void {
    this.selectedCategory.set(null);
  }

  /** Closes the menu and opens the search panel, like the bottom bar's search icon. */
  openSearch(): void {
    this.closeMenu();
    // The menu goes inert once closed, so focus returns to the page, not to this button.
    void this.#searchPanel.open();
  }

  closeMenu(): void {
    this.selectedCategory.set(null);
    this.drawerService.close();
  }
}
