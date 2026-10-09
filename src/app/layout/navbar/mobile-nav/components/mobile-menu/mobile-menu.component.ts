import { Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { NavCategory } from '../../../nav.model';
import { NavService } from '../../../nav.service';

@Component({
  selector: 'app-mobile-menu',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './mobile-menu.component.html',
  host: {
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class MobileMenuComponent {
  readonly drawerService = inject(DrawerService);
  readonly #navService = inject(NavService);
  readonly categories = this.#navService.categories;

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
