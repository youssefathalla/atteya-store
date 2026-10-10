import { computed, DestroyRef, inject, Service, signal, WritableSignal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminNavCategory } from './admin-nav.model';
import { ADMIN_NAV_CATEGORIES } from './admin-nav.data';

const SIDEBAR_STORAGE_KEY = 'atteya_admin_sidebar_open';

function getStoredSidebarState(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return true;
  }
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  } catch {
    return true;
  }
}

function setStoredSidebarState(open: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch {
    // Ignore storage quota or access errors in restricted/private modes
  }
}

@Service()
export class AdminNavService {
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  readonly categories = signal<readonly AdminNavCategory[]>(ADMIN_NAV_CATEGORIES);
  readonly isMobileMenuOpen = signal<boolean>(false);
  readonly selectedCategory = signal<AdminNavCategory | null>(null);

  readonly isDesktopSidebarOpen: WritableSignal<boolean> = signal<boolean>(getStoredSidebarState());
  readonly currentUrl = signal<string>(this.#router.url);

  readonly currentPageTitle = computed<string>(() => {
    const url = this.currentUrl();
    for (const cat of this.categories()) {
      const match = cat.subItems?.find(
        (item) => item.path && (url === item.path || url.startsWith(`${item.path}/`)),
      );
      if (match) return match.label;
    }
    return 'Navigation & Menus';
  });

  constructor() {
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
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

  toggleDesktopSidebar(): void {
    const next = !this.isDesktopSidebarOpen();
    this.isDesktopSidebarOpen.set(next);
    setStoredSidebarState(next);
  }

  setDesktopSidebarOpen(open: boolean): void {
    this.isDesktopSidebarOpen.set(open);
    setStoredSidebarState(open);
  }
}
