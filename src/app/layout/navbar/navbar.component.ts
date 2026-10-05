import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavCategory } from './navbar.model';
import { NAV_CATEGORIES } from './navbar.data';
import { NavbarActionsComponent } from './components/navbar-actions/navbar-actions.component';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { DesktopNavComponent } from './components/desktop-nav/desktop-nav.component';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-navbar',
  imports: [
    RouterLink,
    SharedIconModule,
    NavbarActionsComponent,
    LogoComponent,
    DesktopNavComponent,
    MatButtonModule
],
  templateUrl: './navbar.component.html',
  host: {
    class: 'block w-full sticky top-0 z-50',
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class NavbarComponent {
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  // Categories for Mobile Drawer
  readonly categories = signal<readonly NavCategory[]>(NAV_CATEGORIES);

  // Mobile Drawer State
  readonly isMobileMenuOpen = signal<boolean>(false);
  readonly activeMobileAccordion = signal<string | null>(null);

  constructor() {
    // Automatically close mobile drawer on route navigation
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(() => {
        this.isMobileMenuOpen.set(false);
      });
  }

  onEscape(): void {
    this.isMobileMenuOpen.set(false);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((open) => !open);
  }

  toggleMobileAccordion(categoryId: string): void {
    this.activeMobileAccordion.update((current) =>
      current === categoryId ? null : categoryId,
    );
  }
}
