import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavCategory } from '../../../models/nav.model';
import { NAV_CATEGORIES } from '../../../data/nav.data';

@Component({
  selector: 'app-nav-links',
  imports: [RouterLink],
  templateUrl: './nav-links.component.html',
  host: {
    class: 'h-full hidden lg:flex items-center z-20',
    '(window:resize)': 'updateNavLeft()',
    '(window:keydown.escape)': 'closeMegaMenuImmediate()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class NavLinksComponent {
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  // Left offset to align mega menu content exactly with the navlist
  readonly navLeft = signal<number>(0);

  // Categories & Active Mega Menu State
  readonly categories = input<readonly NavCategory[]>(NAV_CATEGORIES);
  readonly activeCategoryId = signal<string | null>(null);

  // Computed: currently hovered/active category
  readonly activeCategory = computed(() => {
    const id = this.activeCategoryId();
    if (!id) return null;
    return this.categories().find((cat) => cat.id === id) ?? null;
  });

  // Debounce timer for smooth hover transitions between nav items and the dropdown
  #closeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => {
      this.updateNavLeft();
    });

    // Automatically close mega menu on route navigation
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(() => {
        this.closeMegaMenuImmediate();
      });
  }

  updateNavLeft(): void {
    const hostEl = this.#elementRef.nativeElement;
    const headerEl = hostEl.closest('header') ?? hostEl.parentElement;
    if (hostEl && headerEl) {
      const hostRect = hostEl.getBoundingClientRect();
      const headerRect = headerEl.getBoundingClientRect();
      const offset = hostRect.left - headerRect.left;
      this.navLeft.set(Math.max(0, Math.round(offset)));
    }
  }

  onCategoryMouseEnter(categoryId: string): void {
    this.updateNavLeft();
    if (this.#closeTimeout) {
      clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
    const cat = this.categories().find((c) => c.id === categoryId);
    if (cat?.megaMenu && cat.megaMenu.length > 0) {
      this.activeCategoryId.set(categoryId);
    } else {
      this.activeCategoryId.set(null);
    }
  }

  onCategoryMouseLeave(): void {
    this.scheduleClose();
  }

  onMenuMouseEnter(): void {
    if (this.#closeTimeout) {
      clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
  }

  onMenuMouseLeave(): void {
    this.scheduleClose();
  }

  scheduleClose(): void {
    if (this.#closeTimeout) {
      clearTimeout(this.#closeTimeout);
    }
    this.#closeTimeout = setTimeout(() => {
      this.activeCategoryId.set(null);
      this.#closeTimeout = null;
    }, 100);
  }

  closeMegaMenuImmediate(): void {
    if (this.#closeTimeout) {
      clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
    this.activeCategoryId.set(null);
  }

  onCategoryClick(category: NavCategory, event: MouseEvent): void {
    if (category.megaMenu && category.megaMenu.length > 0) {
      if (this.activeCategoryId() !== category.id) {
        // First tap/click on touch/tablet: open menu instead of navigating
        event.preventDefault();
        this.updateNavLeft();
        this.activeCategoryId.set(category.id);
      } else {
        // Second tap/click: allow navigation to category.path and close
        this.closeMegaMenuImmediate();
      }
    } else {
      this.closeMegaMenuImmediate();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.#elementRef.nativeElement.contains(event.target as Node)) {
      this.closeMegaMenuImmediate();
    }
  }
}
