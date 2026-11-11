/** What the confirmed-email rules read from the caller's ID token. */
export interface ConfirmedEmailCaller {
  readonly email?: string;
  /** True only when the token says `email_verified` (Google, or a confirmed email/password account). */
  readonly emailVerified: boolean;
}

/**
 * The `signedIn` flag order pricing uses. Offers for signed-in shoppers (and once-per-customer
 * offers, which the engine also keeps for signed-in shoppers) need a signed-in caller whose email
 * is confirmed; a guest (null) or an unconfirmed account is priced like a guest.
 */
export function offerPricingSignedIn(caller: ConfirmedEmailCaller | null): boolean {
  return caller !== null && caller.emailVerified;
}
