import { effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';

export const NOT_ADMIN_MESSAGE = "This account can't manage the store.";

let lastNotAdminNotice = 0;

/** One notice if the guard and the open admin page both react to the same change. */
export function notifyNotAdmin(snackbar: SnackbarService): void {
  const now = Date.now();
  if (now - lastNotAdminNotice < 2000) return;
  lastNotAdminNotice = now;
  snackbar.info(NOT_ADMIN_MESSAGE);
}

/** Sends a signed-in person on from `/login`. Holds while Google is being connected or consent is incomplete. */
export function leaveAfterSignIn(
  auth: AuthService,
  router: Router,
  snackbar: SnackbarService,
  returnUrl: () => string,
): void {
  let left = false;

  effect(() => {
    const ready = auth.isAuthReady();
    const signedIn = auth.isAuthenticated();
    const hold =
      auth.needsGoogleLink() ||
      auth.linkingGoogle() ||
      !auth.consentReady() ||
      auth.needsConsent();
    const admin = auth.isAdmin();
    const requested = returnUrl();
    if (!ready || !signedIn || hold || left) return;

    left = true;
    untracked(() => {
      const target = safeReturnUrl(requested);
      if (target.startsWith('/admin') && !admin) {
        notifyNotAdmin(snackbar);
        void router.navigateByUrl('/');
        return;
      }
      void router.navigateByUrl(target);
    });
  });
}
