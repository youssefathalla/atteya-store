import { CanActivateFn } from '@angular/router';
import { isOrderViewKey } from '@core/services/orders/order.schema';
import { readGuestOrder } from '@features/checkout/utils/guest-order-storage';
import { requireAgreedAccount, requireConsentIfSignedIn } from '../account/require-account';

/**
 * Checkout is open to guests (they order with an email). A signed-in account that has not agreed
 * to the terms yet is sent to `/login` first, as on every other account page.
 */
export const checkoutAuthGuard: CanActivateFn = (_route, state) => requireConsentIfSignedIn(state.url);

/**
 * The order page opens without signing in only for a guest order: a view key in the link or one
 * saved on this device. Any other link (a signed-in customer's order, whose email link has no key)
 * still needs the account, so a signed-out owner is sent to sign in instead of "could not find".
 */
export const orderConfirmationGuard: CanActivateFn = (route, state) => {
  const orderId = route.paramMap.get('orderId') ?? '';
  const hasKey =
    isOrderViewKey(route.queryParamMap.get('key')) ||
    (orderId !== '' && readGuestOrder(orderId).key !== null);
  return hasKey ? requireConsentIfSignedIn(state.url) : requireAgreedAccount(state.url);
};
