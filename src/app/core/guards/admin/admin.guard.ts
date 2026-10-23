import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';

/**
 * Signed-out visitors leave admin pages for `/login`.
 * The three-role check (non-admins sent home) belongs to the later guard pass.
 * Admin routes render on the client, so the server never enters the dashboard.
 */
export const adminGuard: CanActivateFn = async () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return false;

  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForAuthReady();

  const requested = router.currentNavigation()?.finalUrl?.toString() ?? '/admin';
  const returnUrl = safeReturnUrl(requested);

  if (!auth.isAuthenticated()) {
    throw new RedirectCommand(router.createUrlTree(['/login'], { queryParams: { returnUrl } }));
  }

  await auth.refreshRole(true);
  if (!auth.isAuthenticated()) {
    throw new RedirectCommand(router.createUrlTree(['/login'], { queryParams: { returnUrl } }));
  }

  return true;
};
