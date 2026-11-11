import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injector, PLATFORM_ID, Service, signal } from '@angular/core';
import { createBlockScrollStrategy, OverlayContainer } from '@angular/cdk/overlay';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type DrawerType = 'menu' | 'cart' | null;

@Service()
export class DrawerService {
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  readonly #activeDrawer = signal<DrawerType>(null);
  readonly activeDrawer = this.#activeDrawer.asReadonly();

  /**
   * Holds the page still while the bag is open, so a scroll inside the bag never moves the
   * page behind it (iOS Safari included). Same CDK lock the search and account panels get
   * from CDK Dialog: closing puts the page back where it was. Browser only.
   */
  readonly #pageLock = isPlatformBrowser(inject(PLATFORM_ID))
    ? createBlockScrollStrategy(inject(Injector))
    : null;
  readonly #overlayContainer = inject(OverlayContainer);

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
    this.#destroyRef.onDestroy(() => this.#pageLock?.disable());
  }

  open(type: Exclude<DrawerType, null>): void {
    this.#set(type);
  }

  close(): void {
    this.#set(null);
  }

  toggle(type: Exclude<DrawerType, null>): void {
    this.#set(this.#activeDrawer() === type ? null : type);
  }

  isOpen(type: Exclude<DrawerType, null>): boolean {
    return this.#activeDrawer() === type;
  }

  /** Locks or frees the page in the same step, so a panel opened right after never finds it locked. */
  #set(type: DrawerType): void {
    this.#activeDrawer.set(type);
    if (!this.#pageLock) return;
    if (type === 'cart') {
      // The lock's CSS (`.cdk-global-scrollblock`) ships with the CDK overlay styles, which load
      // only when an overlay is first made. On a phone nothing may have made one yet.
      this.#overlayContainer.getContainerElement();
      this.#pageLock.enable();
    } else {
      this.#pageLock.disable();
    }
  }
}
