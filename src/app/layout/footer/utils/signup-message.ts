/** Fallback when the sign-up fails for a reason we can't explain (offline, server error). */
export const SIGNUP_FAILED = "We couldn't sign you up just now. Please try again.";

/** Shown under the form after a successful sign-up. */
export const SIGNUP_MESSAGES = {
  subscribed: "Thanks! We'll email you about new arrivals and offers.",
  'already-subscribed': "You're already on our list. Thanks for staying with us!",
} as const;

/** Refusals whose server message is written for shoppers (see `subscribeToEmails`). */
const EXPLAINED_CODES = new Set([
  'functions/invalid-argument',
  'functions/resource-exhausted',
  'functions/failed-precondition',
]);

/**
 * The server's own sentence for an expected refusal (bad email, too many tries today, page needs a refresh),
 * otherwise `SIGNUP_FAILED`. Bare status texts like "internal" are never shown.
 */
export function signupErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return SIGNUP_FAILED;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !EXPLAINED_CODES.has(code)) return SIGNUP_FAILED;
  return typeof message === 'string' && message.trim().includes(' ') ? message.trim() : SIGNUP_FAILED;
}
