import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injector, PLATFORM_ID, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SearchService } from '@core/services/search';
// Type only: the component itself is imported on first open.
import type { SearchPanelComponent } from '../search-panel.component';

/**
 * Opens the storefront search panel (`app-search-panel`) over the current page:
 * a side panel from the right on desktop, full screen on phone (sizes live in
 * `.search-panel`). CDK Dialog gives the focus trap, Esc / backdrop close,
 * page scroll lock and focus return to the icon that opened it.
 * The panel component is loaded on first open, so it stays out of the first bundle.
 */
@Service()
export class SearchPanelService {
  readonly #dialog = inject(Dialog);
  readonly #injector = inject(Injector);
  readonly #router = inject(Router);
  readonly #drawer = inject(DrawerService);
  readonly #search = inject(SearchService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  #ref: DialogRef<unknown, SearchPanelComponent> | null = null;
  #opening = false;

  constructor() {
    // Opening a result or "See All Results" leaves the page: close the panel with it.
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.close());
  }

  /** `trigger` gets focus back when the panel closes (Safari doesn't focus buttons on click). */
  async open(trigger?: HTMLElement | null): Promise<void> {
    if (!this.#isBrowser || this.#ref || this.#opening) return;
    this.#opening = true;
    this.#drawer.close();
    this.#search.warm();

    let component: typeof SearchPanelComponent;
    try {
      ({ SearchPanelComponent: component } = await import('../search-panel.component'));
    } catch {
      // The panel couldn't load (offline or a new release): the full search page still works.
      this.#opening = false;
      void this.#router.navigateByUrl('/search');
      return;
    }

    const ref = this.#dialog.open(component, {
      ariaLabel: 'Search products',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      panelClass: 'search-panel-pane',
      maxWidth: '100vw',
      maxHeight: '100dvh',
      positionStrategy: createGlobalPositionStrategy(this.#injector).top('0').right('0'),
      autoFocus: '#search-panel-input',
      restoreFocus: trigger ?? true,
    });
    this.#ref = ref;
    this.#opening = false;
    ref.closed.subscribe(() => {
      if (this.#ref === ref) this.#ref = null;
    });
  }

  close(): void {
    this.#ref?.close();
  }
}
