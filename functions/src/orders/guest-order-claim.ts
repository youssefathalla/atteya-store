/** At most this many guest orders are linked by one `claimGuestOrdersByEmail` call. */
export const MAX_GUEST_ORDERS_PER_CLAIM = 50;

import type { ConfirmedEmailCaller } from './offer-signed-in.js';

/**
 * The email whose guest orders a signed-in caller may take: their token email, trimmed and
 * lower-cased, only when the token says it is confirmed. An unconfirmed email can be any address
 * typed at sign-up, so it proves nothing and links nothing (null).
 */
export function confirmedClaimEmail(caller: ConfirmedEmailCaller): string | null {
  if (!caller.emailVerified || typeof caller.email !== 'string') return null;
  const email = caller.email.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

/**
 * Whether an order may be linked to the account with this confirmed email: a guest order (it has
 * the `guest` terms block guest checkout saves) with no owner (`customerId: null`) whose
 * `customerEmail` is exactly that email (guest checkout stores it trimmed and lower-cased). An order
 * that already belongs to an account, or one made some other way, is never moved.
 */
export function isClaimableGuestOrder(
  order: Readonly<Record<string, unknown>> | undefined,
  email: string,
): boolean {
  if (!order || order['customerId'] !== null) return false;
  const guest = order['guest'];
  if (typeof guest !== 'object' || guest === null) return false;
  return order['customerEmail'] === email;
}
