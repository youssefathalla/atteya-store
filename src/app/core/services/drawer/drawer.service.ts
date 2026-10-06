import { DestroyRef, inject, Service, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type DrawerType = 'menu' | 'cart' | null;

@Service()
export class DrawerService {
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  readonly activeDrawer = signal<DrawerType>(null);

  constructor() {
    // Automatically close any open drawer on route navigation
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(() => {
        this.close();
      });
  }

  open(type: Exclude<DrawerType, null>): void {
    this.activeDrawer.set(type);
  }

  close(): void {
    this.activeDrawer.set(null);
  }

  toggle(type: Exclude<DrawerType, null>): void {
    this.activeDrawer.update((curr) => (curr === type ? null : type));
  }

  isOpen(type: Exclude<DrawerType, null>): boolean {
    return this.activeDrawer() === type;
  }
}
