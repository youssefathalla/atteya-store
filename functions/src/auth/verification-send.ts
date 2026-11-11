/**
 * Pure rules for `sendVerificationEmail` (the "Confirm Your Email" message): the daily send limit
 * per account and the page the confirmation link returns to. Tested in `verification-send.test.ts`.
 */

/** Confirmation emails one account can ask for per UTC day. */
export const MAX_VERIFICATION_SENDS_PER_UTC_DAY = 3;

export const VERIFICATION_LIMIT_MESSAGE =
  "You've asked for 3 emails today. Please check your inbox or try again tomorrow.";

/** Where the link returns to when the caller names no page: the shopper's account. */
export const DEFAULT_VERIFICATION_RETURN_PATH = '/account';

const MAX_RETURN_PATH_LENGTH = 500;
/** A site path: starts with one `/`, then printable ASCII with no spaces or backslashes. */
const SITE_PATH = /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]*$/;

/** `emailVerificationSends` doc id for one account's daily counter. */
export function verificationSendDocId(uid: string, day: string): string {
  return `${uid}_${day}`;
}

/**
 * Next value for `emailVerificationSends/{uid}_{day}.count`, or null when the account has already
 * had its 3 emails today.
 */
export function nextVerificationSendCount(raw: unknown): number | null {
  const count = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  return count >= MAX_VERIFICATION_SENDS_PER_UTC_DAY ? null : count + 1;
}

/** Counter docs carry `expireAt` (2 days later) so a Firestore TTL policy can delete them. */
export function verificationSendExpireAt(now = new Date()): Date {
  return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
}

/**
 * The page on our own site the link opens after confirming: the caller's `returnPath` when it is a
 * plain site path (`/checkout/confirmation/abc?key=…`), otherwise `/account`. Returns null when the
 * storefront address is not set, so the link falls back to Firebase's own page.
 */
export function verificationContinueUrl(storefrontUrl: string, returnPath: unknown): string | null {
  const origin = storefrontUrl.trim().replace(/\/+$/, '');
  if (!origin) return null;
  const path =
    typeof returnPath === 'string' &&
    returnPath.length <= MAX_RETURN_PATH_LENGTH &&
    SITE_PATH.test(returnPath)
      ? returnPath
      : DEFAULT_VERIFICATION_RETURN_PATH;
  try {
    const base = new URL(origin);
    const url = new URL(path, base);
    return url.origin === base.origin ? url.toString() : `${base.origin}${DEFAULT_VERIFICATION_RETURN_PATH}`;
  } catch {
    return null;
  }
}
