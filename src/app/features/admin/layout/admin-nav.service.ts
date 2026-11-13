import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  resource,
  Service,
  signal,
  WritableSignal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@core/services/auth/auth.service';
import { AdminNavCategory } from './admin-nav.model';
import { ADMIN_NAV_CATEGORIES } from './admin-nav.data';
import { ReturnsAdminService } from '../pages/returns-manager/services/returns-admin.service';

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
  readonly #auth = inject(AuthService);
  readonly #returns = inject(ReturnsAdminService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Bumped after a Returns step so the menu count reads again. */
  readonly #returnsCountVersion = signal(0);

  /** Requests waiting for Approve or Reject (ATS-293); shown on the Returns menu item. */
  readonly #requestedCount = resource({
    params: () =>
      this.#browser && this.#auth.canManageStore() ? { version: this.#returnsCountVersion() } : undefined,
    loader: () => this.#returns.countRequested(),
  });

  /** The sidebar; staff don't see admin-only pages (Team). Returns shows its Requested count. */
  readonly categories = computed<readonly AdminNavCategory[]>(() => {
    const isAdmin = this.#auth.isAdmin();
    const count = this.#requestedCount.hasValue() ? this.#requestedCount.value() : 0;
    return ADMIN_NAV_CATEGORIES.map((category) => ({
      ...category,
      subItems: category.subItems
        ?.filter((item) => isAdmin || !item.adminOnly)
        .map((item) => (item.id === 'returns' && count > 0 ? { ...item, badge: String(count) } : item)),
    }));
  });

  /** Reads the Returns count again (after Approve or Reject). */
  refreshReturnsCount(): void {
    this.#returnsCountVersion.update((version) => version + 1);
  }
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
