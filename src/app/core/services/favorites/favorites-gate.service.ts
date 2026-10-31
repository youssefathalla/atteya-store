import { isPlatformBrowser } from '@angular/common';
import { effect, inject, PLATFORM_ID, Service, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import {
  FavoritesSignInDialogComponent,
  type FavoritesSignInDialogResult,
} from '@shared/ui/dialogs/favorites-sign-in-dialog/favorites-sign-in-dialog.component';
import { FavoritesService } from './favorites.service';
import { clearPendingFavorite, readPendingFavorite, stashPendingFavorite } from './pending-favorite';

/**
 * Guest heart taps open an explicit sign-in prompt (never local/anonymous saves).
 * After sign-in, applies one pending favorite add and returns via login returnUrl.
 */
@Service()
export class FavoritesGateService {
  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #dialog = inject(MatDialog);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  #applyingPending = false;
  #dialogOpen = false;

  constructor() {
    effect(() => {
      const authReady = this.#auth.isAuthReady();
      const signedIn = this.#auth.isAuthenticated();
      const favoritesReady = this.#favorites.ready();
      const needsConsent = this.#auth.needsConsent();
      const consentReady = this.#auth.consentReady();
      if (
        !this.#isBrowser ||
        !authReady ||
        !signedIn ||
        !favoritesReady ||
        !consentReady ||
        needsConsent
      ) {
        return;
      }
      untracked(() => void this.#applyPendingFavorite());
    });
  }

  /**
   * Signed-in: toggle. Guest: dialog → login (optionally create intent) with pending stash.
   * Guests never get a filled heart and never write favorites locally.
   */
  async onFavoriteClick(productId: string, slug: string): Promise<void> {
    if (!this.#isBrowser || !this.#auth.isAuthReady()) return;

    if (this.#auth.isAuthenticated()) {
      if (this.#auth.needsConsent()) return;
      void this.#favorites.toggle(productId, slug);
      return;
    }

    if (this.#dialogOpen) return;
    this.#dialogOpen = true;
    try {
      const ref = this.#dialog.open<
        FavoritesSignInDialogComponent,
        void,
        FavoritesSignInDialogResult
      >(FavoritesSignInDialogComponent, {
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      });
      const choice = await firstValueFrom(ref.afterClosed());
      if (choice !== 'sign-in' && choice !== 'create') return;

      stashPendingFavorite(productId, slug);
      const queryParams: Record<string, string> = {
        returnUrl: safeReturnUrl(this.#router.url),
      };
      if (choice === 'create') queryParams['intent'] = 'create';
      void this.#router.navigate(['/login'], { queryParams });
    } finally {
      this.#dialogOpen = false;
    }
  }

  async #applyPendingFavorite(): Promise<void> {
    if (this.#applyingPending) return;
    const pending = readPendingFavorite();
    if (!pending) return;

    this.#applyingPending = true;
    try {
      await this.#favorites.add(pending.productId, pending.slug);
    } finally {
      // Favorites are ready here; clear whether added, already saved, capped, or failed.
      clearPendingFavorite();
      this.#applyingPending = false;
    }
  }
}
