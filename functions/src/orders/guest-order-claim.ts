import { claimEmailMatches } from './order-view.js';

/** At most this many guest orders are linked by one `claimGuestOrdersByEmail` call. */
export const MAX_GUEST_ORDERS_PER_CLAIM = 50;

/** What the claim and pricing rules read from the caller's ID token. */
export interface ConfirmedEmailCaller {
  readonly email?: string;
  /** True only when the token says `email_verified` (Google, or a confirmed email/password account). */
  readonly emailVerified: boolean;
}

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
 * Whether an order may be linked to the account with this confirmed email: it has no owner yet
 * and its `customerEmail` is that email (any case, trimmed). An order that already belongs to an
 * account is never moved.
 */
export function isClaimableGuestOrder(
  order: Readonly<Record<string, unknown>> | undefined,
  email: string,
): boolean {
  if (!order) return false;
  if (order['customerId'] !== null && order['customerId'] !== undefined) return false;
  return claimEmailMatches(order['customerEmail'], email);
}

/**
 * The `signedIn` flag order pricing uses. Offers for signed-in shoppers (and once-per-customer
 * offers, which the engine also keeps for signed-in shoppers) need a signed-in caller whose email
 * is confirmed; a guest (null) or an unconfirmed account is priced like a guest.
 */
export function offerPricingSignedIn(caller: ConfirmedEmailCaller | null): boolean {
  return caller !== null && caller.emailVerified;
}
