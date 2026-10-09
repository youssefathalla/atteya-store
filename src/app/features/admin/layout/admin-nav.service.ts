import { DestroyRef, inject, Service, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminNavCategory } from './admin-nav.model';
import { ADMIN_NAV_CATEGORIES } from './admin-nav.data';

@Service()
export class AdminNavService {
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  readonly categories = signal<readonly AdminNavCategory[]>(ADMIN_NAV_CATEGORIES);
  readonly isMobileMenuOpen = signal<boolean>(false);
  readonly selectedCategory = signal<AdminNavCategory | null>(null);

  constructor() {
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(() => {
        this.closeMobileMenu();
      });
  }

  openMobileMenu(): void {
    this.isMobileMenuOpen.set(true);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
    this.selectedCategory.set(null);
  }

  toggleMobileMenu(): void {
    if (this.isMobileMenuOpen()) {
      this.closeMobileMenu();
    } else {
      this.openMobileMenu();
    }
  }

  selectCategory(category: AdminNavCategory): void {
    this.selectedCategory.set(category);
  }

  goBack(): void {
    this.selectedCategory.set(null);
  }
}
