import { CanActivateFn } from '@angular/router';
import { requireConsentIfSignedIn } from '../account/require-account';

/**
 * Checkout and the order page are open to guests (they order with an email). A signed-in account
 * that has not agreed to the terms yet is sent to `/login` first, as on every other account page.
 */
export const checkoutAuthGuard: CanActivateFn = (_route, state) => requireConsentIfSignedIn(state.url);
