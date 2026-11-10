import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

/** Orders one shopper can place per UTC day (all payment methods together). */
export const MAX_ORDERS_PER_UID_PER_UTC_DAY = 20;

/**
 * Guest orders (no sign-in) one connection (hashed caller IP) can place per UTC day. High on purpose:
 * many shoppers can share one mobile-network or venue address, and the email and store-wide caps
 * still bound a script.
 */
export const MAX_GUEST_ORDERS_PER_IP_PER_UTC_DAY = 50;

/** Guest orders one email address can place per UTC day. */
export const MAX_GUEST_ORDERS_PER_EMAIL_PER_UTC_DAY = 5;

/**
 * Guest orders the whole store accepts per UTC day. The caller IP can be faked and anyone can type
 * a new email, so this store-wide cap is what bounds a script. Signed-in orders never count here.
 */
export const MAX_GUEST_ORDERS_PER_UTC_DAY = 500;

const GUEST_LIMIT_MESSAGE =
  'Too many orders were placed today. Please try again tomorrow or message us on WhatsApp.';

/** Next value for `orderRateLimits/{uid}_{day}.count`; throws once the daily cap is reached. */
export function nextDailyOrderCount(raw: unknown): number {
  const count = readCount(raw);
  if (count >= MAX_ORDERS_PER_UID_PER_UTC_DAY) {
    throw new HttpsError('resource-exhausted', 'You have placed too many orders today. Try again tomorrow.');
  }
  return count + 1;
}

/** Next value for `orderRateLimits/guest_ip_{hash}_{day}.count`; throws once the cap is reached. */
export function nextGuestIpOrderCount(raw: unknown): number {
  return nextGuestCount(raw, MAX_GUEST_ORDERS_PER_IP_PER_UTC_DAY);
}

/** Next value for `orderRateLimits/guest_email_{sha256}_{day}.count`; throws once the cap is reached. */
export function nextGuestEmailOrderCount(raw: unknown): number {
  return nextGuestCount(raw, MAX_GUEST_ORDERS_PER_EMAIL_PER_UTC_DAY);
}

/** Next value for the store-wide `orderRateLimits/guest_all_{day}.count`; throws once the cap is reached. */
export function nextGuestStoreOrderCount(raw: unknown): number {
  return nextGuestCount(raw, MAX_GUEST_ORDERS_PER_UTC_DAY);
}

/** Rate-limit key part for a guest's caller IP. The IP itself is never stored. */
export function hashGuestOrderIp(ip: string): string {
  return createHash('sha256').update(`guest-order:${ip}`).digest('hex').slice(0, 32);
}

/** SHA-256 (hex) of a normalized (trimmed, lower-cased) guest email. */
export function hashGuestEmail(normalizedEmail: string): string {
  return createHash('sha256').update(normalizedEmail).digest('hex');
}

/** `orderRateLimits` doc id for one guest connection's daily counter. */
export function guestIpRateLimitId(ipHash: string, day: string): string {
  return `guest_ip_${ipHash}_${day}`;
}

/** `orderRateLimits` doc id for one guest email's daily counter. */
export function guestEmailRateLimitId(emailHash: string, day: string): string {
  return `guest_email_${emailHash}_${day}`;
}

/** `orderRateLimits` doc id for the store-wide daily guest counter. */
export function guestStoreRateLimitId(day: string): string {
  return `guest_all_${day}`;
}

/** Guest rate-limit docs carry `expireAt` (2 days later) so a Firestore TTL policy can delete them. */
export function guestRateLimitExpireAt(now = new Date()): Date {
  return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
}

/** `yyyymmdd` in UTC, the second half of the rate-limit doc id. */
export function utcDayKey(now = new Date()): string {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function nextGuestCount(raw: unknown, max: number): number {
  const count = readCount(raw);
  if (count >= max) throw new HttpsError('resource-exhausted', GUEST_LIMIT_MESSAGE);
  return count + 1;
}

function readCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}
