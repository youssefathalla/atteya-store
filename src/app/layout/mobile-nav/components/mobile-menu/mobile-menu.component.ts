import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { DrawerService } from '../../../../core/services/drawer/drawer.service';
import { NAV_CATEGORIES } from '../../../data/nav.data';
import { NavCategory } from '../../../models/nav.model';

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
  readonly categories = signal<readonly NavCategory[]>(NAV_CATEGORIES);

  // Reactive bottom sheet open state
  readonly isOpen = computed(() => this.drawerService.isOpen('menu'));

  // Drill-down level 2 selection
  readonly selectedCategory = signal<NavCategory | null>(null);

  constructor() {
    effect(() => {
      if (!this.isOpen()) {
        this.selectedCategory.set(null);
      }
    });
  }

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
