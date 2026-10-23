import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { notifyNotAdmin } from '@features/auth/utils/login-exit';

/**
 * Visitors go to sign in. Signed-in people who are not admins go home.
 * The first entry force-refreshes the ID token. Moves inside `/admin` reuse
 * the current role, which the role-mirror listener keeps up to date.
 * Admin routes render on the client, so the server never enters the dashboard.
 */
export const adminGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return false;

  const auth = inject(AuthService);
  const router = inject(Router);
  const snackbar = inject(SnackbarService);
  await auth.waitForAuthReady();

  const returnUrl = safeReturnUrl(state.url);
  const login = new RedirectCommand(
    router.createUrlTree(['/login'], { queryParams: { returnUrl } }),
  );

  if (!auth.isAuthenticated()) {
    throw login;
  }

  const alreadyInside = router.url.startsWith('/admin');
  if (!alreadyInside) {
    await auth.refreshRole(true);
  }

  if (!auth.isAuthenticated()) {
    throw login;
  }

  if (!auth.isAdmin()) {
    notifyNotAdmin(snackbar);
    throw new RedirectCommand(router.parseUrl('/'));
  }

  return true;
};
