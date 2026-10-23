import { Component, computed, inject, input } from '@angular/core';
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

  readonly tooltip = input<string>('');
  readonly yPosition = input<'above' | 'below'>('below');

  readonly isAuthenticated = this.#auth.isAuthenticated;
  readonly isAdmin = this.#auth.isAdmin;
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
