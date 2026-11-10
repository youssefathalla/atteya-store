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
 * The order page. A guest order opens by its view key (`?key=` in the link, or saved on this
 * device at checkout or an earlier visit), so a visit with a key works as for checkout. Without
 * a key the order can only be read by its signed-in owner, so a visitor goes to sign in first
 * (and comes back to the order) instead of seeing "could not find".
 */
export const orderPageAuthGuard: CanActivateFn = (route, state) => {
  const orderId = route.paramMap.get('orderId') ?? '';
  const hasKey = isOrderViewKey(route.queryParamMap.get('key')) || readGuestOrder(orderId).key !== null;
  return hasKey ? requireConsentIfSignedIn(state.url) : requireAgreedAccount(state.url);
};
