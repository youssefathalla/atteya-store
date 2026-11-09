import { CanActivateFn } from '@angular/router';
import { requireAgreedAccount } from '../account/require-account';

/** Favorites is personal — send visitors to sign in, and new accounts to the terms step, first. */
export const favoritesAuthGuard: CanActivateFn = (_route, state) => requireAgreedAccount(state.url);
