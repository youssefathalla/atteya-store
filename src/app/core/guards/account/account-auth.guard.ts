import { CanActivateFn } from '@angular/router';
import { requireAgreedAccount } from './require-account';

/** `/account` is personal: send visitors to sign in, and new accounts to the terms step, first. */
export const accountAuthGuard: CanActivateFn = (_route, state) => requireAgreedAccount(state.url);
