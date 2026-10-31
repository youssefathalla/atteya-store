import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';

/** Favorites is personal — send visitors to sign in first. */
export const favoritesAuthGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForAuthReady();

  if (auth.isAuthenticated()) return true;

  throw new RedirectCommand(
    router.createUrlTree(['/login'], { queryParams: { returnUrl: safeReturnUrl(state.url) } }),
  );
};
