import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injector, PLATFORM_ID, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { NavigationSkipped, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { DrawerService } from '@core/services/drawer/drawer.service';
// Type only: the component itself is imported on first open.
import type { AccountPanelComponent } from '../account-panel.component';

/**
 * Opens the signed-in shopper's account panel (`app-account-panel`) from the navbar and mobile
 * bar account icon: a 28rem side panel from the right on desktop, full screen on phone (the
 * `.side-panel` shell, same as search). CDK Dialog gives the focus trap, Esc / backdrop close,
 * page scroll lock and focus return to the icon. Any navigation closes it. The component is
 * loaded on first open, so it stays out of the first bundle.
 */
@Service()
export class AccountPanelService {
  readonly #dialog = inject(Dialog);
  readonly #injector = inject(Injector);
  readonly #router = inject(Router);
  readonly #drawer = inject(DrawerService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  #ref: DialogRef<unknown, AccountPanelComponent> | null = null;
  #opening = false;

  constructor() {
    this.#router.events
      .pipe(
        // NavigationSkipped: a panel link to the URL already shown must still close the panel.
        filter((event) => event instanceof NavigationStart || event instanceof NavigationSkipped),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.close());
  }

  /** `trigger` gets focus back when the panel closes (Safari doesn't focus buttons on click). */
  async open(trigger?: HTMLElement | null): Promise<void> {
    if (!this.#isBrowser || this.#ref || this.#opening) return;
    this.#opening = true;
    this.#drawer.close();

    let component: typeof AccountPanelComponent;
    try {
      ({ AccountPanelComponent: component } = await import('../account-panel.component'));
    } catch {
      // The panel couldn't load (offline or a new release): the account page still works.
      this.#opening = false;
      void this.#router.navigateByUrl('/account');
      return;
    }

    const ref = this.#dialog.open(component, {
      ariaLabel: 'Your account',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      panelClass: 'account-panel-pane',
      maxWidth: '100vw',
      maxHeight: '100dvh',
      positionStrategy: createGlobalPositionStrategy(this.#injector).top('0').right('0'),
      autoFocus: 'first-heading',
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
