import type { Timestamp } from 'firebase-admin/firestore';

export const DEFAULT_MARKUP_PERCENT = 40;
export const MARKUP_MIN = 0;
export const MARKUP_MAX = 200;

const CURRENCY_CODE = /^[A-Z]{3}$/;

export interface PublicCurrencyEntry {
  readonly factor: number;
}

export interface PublicCurrencyBody {
  readonly base: 'EGP';
  readonly currencies: Readonly<Record<string, PublicCurrencyEntry>>;
  readonly ratesUpdatedAt: Timestamp;
}

export function isForeignCurrencyCode(code: string): boolean {
  return CURRENCY_CODE.test(code) && code !== 'EGP';
}

/**
 * Finite number from 0 to 200 with at most one decimal place.
 * Returns null when the value cannot be stored.
 */
export function parseMarkup(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < MARKUP_MIN || value > MARKUP_MAX) return null;
  const scaled = Math.round(value * 10);
  if (Math.abs(value * 10 - scaled) > 1e-6) return null;
  return scaled / 10;
}

/**
 * Combined display factor per currency. The markup is folded into `factor`
 * and is not stored under its own name. EGP is omitted so Egypt prices stay exact.
 */
export function buildPublicCurrencyDoc(
  markupPercent: number,
  rates: Readonly<Record<string, number>>,
  ratesUpdatedAt: Timestamp,
): PublicCurrencyBody {
  const multiplier = 1 + markupPercent / 100;
  const currencies: Record<string, PublicCurrencyEntry> = {};
  for (const [code, rate] of Object.entries(rates)) {
    if (!isForeignCurrencyCode(code)) continue;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue;
    currencies[code] = { factor: multiplier * rate };
  }
  return { base: 'EGP', currencies, ratesUpdatedAt };
}
