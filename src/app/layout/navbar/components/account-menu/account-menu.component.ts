import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-account-menu',
  host: { class: 'inline-flex' },
  imports: [RouterLink, MatButtonModule, MatMenuModule, MatTooltipModule, SharedIconModule],
  templateUrl: './account-menu.component.html',
})
export class AccountMenuComponent {
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tooltip = input<string>('');
  readonly yPosition = input<'above' | 'below'>('below');

  readonly isAuthReady = this.#auth.isAuthReady;
  readonly isAuthenticated = this.#auth.isAuthenticated;
  readonly isAdmin = this.#auth.isAdmin;
  /**
   * The server marks auth ready at once and would otherwise prerender Sign in.
   * The browser starts not-ready. Both must render the placeholder first so
   * hydration matches, then the browser shows Sign in or the account actions.
   */
  readonly menuState = computed(() => {
    if (!this.#isBrowser || !this.isAuthReady()) return 'pending' as const;
    return this.isAuthenticated() ? ('signed-in' as const) : ('signed-out' as const);
  });
  readonly accountLabel = computed(() => {
    const user = this.#auth.user();
    const name = user?.displayName?.trim();
    if (name) return name;
    return user?.email ?? 'Your account';
  });

  signInParams(): { returnUrl: string } {
    return { returnUrl: safeReturnUrl(this.#router.url) };
  }

  signOut(): void {
    void this.#auth.logout();
  }
}
