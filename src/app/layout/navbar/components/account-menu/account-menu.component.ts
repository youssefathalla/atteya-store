import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { AccountPanelService } from '@layout/account-panel/services/account-panel.service';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-account-menu',
  host: { class: 'inline-flex' },
  imports: [RouterLink, MatButtonModule, MatTooltipModule, SharedIconModule],
  templateUrl: './account-menu.component.html',
})
export class AccountMenuComponent {
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);
  readonly #panel = inject(AccountPanelService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tooltip = input<string>('');

  readonly isAuthReady = this.#auth.isAuthReady;
  readonly isAuthenticated = this.#auth.isAuthenticated;
  /**
   * The server marks auth ready at once and would otherwise prerender Sign in.
   * The browser starts not-ready. Both must render the placeholder first so
   * hydration matches, then the browser shows Sign in or the account actions.
   */
  readonly menuState = computed(() => {
    if (!this.#isBrowser || !this.isAuthReady()) return 'pending' as const;
    return this.isAuthenticated() ? ('signed-in' as const) : ('signed-out' as const);
  });

  signInParams(): { returnUrl: string } {
    return { returnUrl: safeReturnUrl(this.#router.url) };
  }

  /** Signed in: the account panel (profile, orders, favorites, Sign Out). */
  openPanel(event: MouseEvent): void {
    void this.#panel.open(event.currentTarget as HTMLElement | null);
  }
}
