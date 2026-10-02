import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';

/**
 * Route guard that requires the user to be authenticated.
 * Waits for Firebase Auth initialization to complete before evaluating.
 * Redirects unauthenticated visitors to '/' (or login).
 */
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForAuthReady();

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.parseUrl('/');
};

/**
 * Route guard for guest-only pages (e.g. login, registration).
 * Redirects already-authenticated users away to '/'.
 */
export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForAuthReady();

  if (!authService.isAuthenticated()) {
    return true;
  }

  return router.parseUrl('/');
};
