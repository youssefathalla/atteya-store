import { CanActivateFn } from '@angular/router';
import { requireAgreedAccount } from '../account/require-account';

/** Checkout needs a signed-in customer who agreed to the terms, so the order has an account. */
export const checkoutAuthGuard: CanActivateFn = (_route, state) => requireAgreedAccount(state.url);
