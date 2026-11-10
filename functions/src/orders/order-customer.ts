import type { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { CURRENT_TERMS_VERSION } from '../auth/accepted-terms.js';
import { requireAppCheck } from '../auth/callable-options.js';
import { requireAcceptedTerms } from '../auth/require-accepted-terms.js';
import { requireRole } from '../auth/require-role.js';
import { guestOfferCustomerKey } from './offer-usage.js';
import { parseGuestCheckout } from './order-request.js';
import { hashGuestEmail, hashGuestOrderIp } from './order-rate-limit.js';

/** A signed-in shopper placing an order: everything works exactly as before guest checkout. */
export interface AccountOrderCustomer {
  readonly kind: 'account';
  readonly uid: string;
  readonly email: string | null;
  /** Priced with `signedIn = true`. */
  readonly signedIn: true;
  /** The id `perCustomer` offer uses are counted under: the uid. */
  readonly offerKey: string;
}

/** A shopper ordering without signing in, known only by the email they typed. */
export interface GuestOrderCustomer {
  readonly kind: 'guest';
  /** Trimmed, lower-cased. */
  readonly email: string;
  readonly emailHash: string;
  /** Hashed caller IP for the guest rate limit; the IP itself is never stored. */
  readonly ipHash: string;
  /** Priced with `signedIn = false`, so offers for signed-in shoppers never apply. */
  readonly signedIn: false;
  /** `guest_<sha256 of the email>`. */
  readonly offerKey: string;
}

export type OrderCustomer = AccountOrderCustomer | GuestOrderCustomer;

/**
 * Who is placing the order. A signed-in call goes through `requireRole` (and ignores any `guest`
 * block); a call with no sign-in needs a valid `guest: { email }` block. App Check runs for both.
 * Call `requireCustomerTerms` afterwards.
 */
export async function identifyOrderCustomer(request: CallableRequest): Promise<OrderCustomer> {
  if (request.auth) {
    const caller = await requireRole(request, 'user');
    return {
      kind: 'account',
      uid: caller.uid,
      email: caller.email ?? null,
      signedIn: true,
      offerKey: caller.uid,
    };
  }
  requireAppCheck(request);
  const data = request.data;
  const guest =
    typeof data === 'object' && data !== null
      ? parseGuestCheckout((data as Record<string, unknown>)['guest'])
      : null;
  if (!guest) {
    throw new HttpsError('unauthenticated', 'Enter your email to place your order.');
  }
  const ip = guestCallerIp(request);
  return {
    kind: 'guest',
    email: guest.email,
    emailHash: hashGuestEmail(guest.email),
    ipHash: hashGuestOrderIp(ip),
    signedIn: false,
    offerKey: guestOfferCustomerKey(guest.email),
  };
}

/**
 * The caller IP for the guest rate limit: Express `req.ip`, the same source the footer email
 * sign-up uses (`subscribeToEmails`). The last X-Forwarded-For entry can be a Google proxy hop shared
 * by many shoppers, which would make the 5-per-connection cap refuse real people. `req.ip` can be
 * faked by a caller adding entries to that header, so it only slows casual repeats; the per-email
 * and store-wide daily caps bound a script, and App Check enforcement is the stronger guard.
 */
function guestCallerIp(request: CallableRequest): string {
  const raw = request.rawRequest;
  return raw?.ip || raw?.socket?.remoteAddress || 'unknown';
}

/**
 * Signed-in shoppers need accepted terms in `users/{uid}`. A guest agrees by placing the order,
 * recorded on the order itself (`guest.termsVersion`, `guest.termsAcceptedAt`).
 */
export async function requireCustomerTerms(customer: OrderCustomer): Promise<void> {
  if (customer.kind === 'account') await requireAcceptedTerms(customer.uid);
}

/**
 * Who the order belongs to. Signed in: `customerId` (uid) and the account email, as before. Guest:
 * `customerId: null`, the typed email, the terms they agreed to by placing the order, and the
 * secret `viewKey` their order links carry.
 */
export function orderCustomerFields(
  customer: OrderCustomer,
  viewKey: string | null,
  now: FieldValue,
): Record<string, unknown> {
  if (customer.kind === 'account') {
    return { customerId: customer.uid, customerEmail: customer.email };
  }
  return {
    customerId: null,
    customerEmail: customer.email,
    guest: { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: now },
    viewKey,
  };
}
