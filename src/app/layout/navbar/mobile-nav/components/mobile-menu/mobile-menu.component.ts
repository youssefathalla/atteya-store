import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { isOutsideAddress } from '@core/services/navigation/nav-target';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AuthService } from '@core/services/auth/auth.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { NavCategory, NavService } from '@core/services/navigation';

@Component({
  selector: 'app-mobile-menu',
  imports: [RouterLink, LinkTargetPipe, NgTemplateOutlet, MatButtonModule, SharedIconModule],
  templateUrl: './mobile-menu.component.html',
  host: {
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class MobileMenuComponent {
  /** An Outside Link (ATS-267) opens another site in a new tab instead of a store page. */
  readonly isOutside = isOutsideAddress;

  readonly drawerService = inject(DrawerService);
  readonly #navService = inject(NavService);
  readonly #auth = inject(AuthService);
  readonly categories = this.#navService.storefrontCategories;
  /** The design playground is admin-only, so its link shows only for admins. */
  readonly canManageStore = this.#auth.canManageStore;
  /** The search row was tapped; the mobile bar opens the search panel (it also closes this menu). */
  readonly searchRequested = output<void>();

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

  closeMenu(): void {
    this.selectedCategory.set(null);
    this.drawerService.close();
  }
}
