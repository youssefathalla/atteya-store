/** How recently the person must have signed in to delete their account (seconds). */
export const DELETE_ACCOUNT_MAX_AGE_SECONDS = 10 * 60;

export const DELETE_ACCOUNT_RECENT_MESSAGE =
  'For your safety, please sign out, sign in again, and then delete your account.';

/**
 * True when the ID token's `auth_time` (seconds since epoch, set when the person last typed their
 * password or used Google) is at most 10 minutes old. A missing or future time counts as not recent.
 */
export function signedInRecently(authTimeSeconds: unknown, nowMs = Date.now()): boolean {
  if (typeof authTimeSeconds !== 'number' || !Number.isFinite(authTimeSeconds)) return false;
  const ageSeconds = nowMs / 1000 - authTimeSeconds;
  return ageSeconds >= -60 && ageSeconds <= DELETE_ACCOUNT_MAX_AGE_SECONDS;
}
