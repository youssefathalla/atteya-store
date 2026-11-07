import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

/** Where a sign-up came from. Add a value here before a new form calls `subscribeToEmails`. */
export const EMAIL_SIGNUP_SOURCES = ['footer'] as const;
export type EmailSignupSource = (typeof EMAIL_SIGNUP_SOURCES)[number];

/** Sign-up attempts one connection (hashed IP) can make per UTC day. */
export const MAX_EMAIL_SIGNUPS_PER_IP_PER_UTC_DAY = 10;

const MAX_EMAIL_LENGTH = 254;
const MAX_PAGE_LENGTH = 200;

export interface EmailSignupRequest {
  readonly email: string;
  readonly source: EmailSignupSource;
  /** Site path the form was on (`/product/…`), or null. */
  readonly page: string | null;
}

/** Lowercase, trimmed email; the same address always gives the same signup doc. */
export function normalizeSignupEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Plain checks, no regex (ReDoS-safe): one `@`, no spaces, a dot inside the domain. */
export function isSignupEmail(value: string): boolean {
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

/** `emailSignups/{id}`: SHA-256 of the normalized email, so a repeat sign-up hits the same doc. */
export function emailSignupDocId(normalizedEmail: string): string {
  return createHash('sha256').update(normalizedEmail).digest('hex');
}

/** Rate-limit key part for a caller IP. The IP itself is never stored. */
export function hashCallerIp(ip: string): string {
  return createHash('sha256').update(`email-signup:${ip}`).digest('hex').slice(0, 32);
}

export function parseEmailSignupRequest(data: unknown): EmailSignupRequest {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const rawEmail = typeof record['email'] === 'string' ? record['email'] : '';
  const email = normalizeSignupEmail(rawEmail);
  if (!isSignupEmail(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  const source = record['source'];
  if (!EMAIL_SIGNUP_SOURCES.includes(source as EmailSignupSource)) {
    throw new HttpsError('invalid-argument', "We couldn't sign you up. Please try again.");
  }
  const rawPage = record['page'];
  const page =
    typeof rawPage === 'string' &&
    rawPage.startsWith('/') &&
    !rawPage.startsWith('//') &&
    rawPage.length <= MAX_PAGE_LENGTH
      ? rawPage
      : null;
  return { email, source: source as EmailSignupSource, page };
}

/** Next value for `emailSignupRateLimits/{ipHash}_{day}.count`; throws once the daily cap is reached. */
export function nextDailySignupCount(raw: unknown): number {
  const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  if (count >= MAX_EMAIL_SIGNUPS_PER_IP_PER_UTC_DAY) {
    throw new HttpsError(
      'resource-exhausted',
      "You've tried to sign up a lot today. Please try again tomorrow.",
    );
  }
  return count + 1;
}
