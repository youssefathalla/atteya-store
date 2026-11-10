import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { RedirectCommand, Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';

/**
 * Shared body of the shopper-account guards (Account, Checkout, Favorites). Call from a guard.
 * A visitor goes to sign in. A signed-in person who has not agreed to the current terms
 * (a new Google account that left the "Almost done" step) goes back to `/login`, which
 * shows that step and then returns them to `url`.
 */
export async function requireAgreedAccount(url: string): Promise<true> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForAccountReady();

  if (auth.isAuthenticated() && !auth.needsConsent()) return true;

  throw new RedirectCommand(
    router.createUrlTree(['/login'], { queryParams: { returnUrl: safeReturnUrl(url) } }),
  );
}

/**
 * Body of the checkout guards: a visitor may stay (guest checkout), and so may a signed-in person
 * who agreed to the terms. A signed-in person who has not agreed yet goes back to `/login`, which
 * shows the "Almost done" step and then returns them to `url`. Call from a guard.
 */
export async function requireConsentIfSignedIn(url: string): Promise<true> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForAccountReady();

  if (!auth.isAuthenticated() || !auth.needsConsent()) return true;

  throw new RedirectCommand(
    router.createUrlTree(['/login'], { queryParams: { returnUrl: safeReturnUrl(url) } }),
  );
}
