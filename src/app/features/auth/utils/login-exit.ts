import { effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';

/** Sends a signed-in person on from `/login`. Holds while Google is being connected. */
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
    const hold = auth.needsGoogleLink() || auth.linkingGoogle();
    const admin = auth.isAdmin();
    const requested = returnUrl();
    if (!ready || !signedIn || hold || left) return;

    left = true;
    untracked(() => {
      const target = safeReturnUrl(requested);
      if (target.startsWith('/admin') && !admin) {
        snackbar.info("This account can't manage the store.");
        void router.navigateByUrl('/');
        return;
      }
      void router.navigateByUrl(target);
    });
  });
}
