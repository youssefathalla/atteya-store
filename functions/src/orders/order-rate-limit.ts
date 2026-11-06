import { HttpsError } from 'firebase-functions/v2/https';

/** Orders one shopper can place per UTC day (all payment methods together). */
export const MAX_ORDERS_PER_UID_PER_UTC_DAY = 20;

/** Next value for `orderRateLimits/{uid}_{day}.count`; throws once the daily cap is reached. */
export function nextDailyOrderCount(raw: unknown): number {
  const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  if (count >= MAX_ORDERS_PER_UID_PER_UTC_DAY) {
    throw new HttpsError(
      'resource-exhausted',
      'You have placed too many orders today. Try again tomorrow.',
    );
  }
  return count + 1;
}

/** `yyyymmdd` in UTC, the second half of the rate-limit doc id. */
export function utcDayKey(now = new Date()): string {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
