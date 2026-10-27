import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Whitelist and rounding for prices outside Egypt.
 * Keep `CURRENCY_CODES` identical to `FOREIGN_CURRENCY_CODES` in
 * `src/app/core/services/currency/currency-detect.ts`.
 */
export const CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'OMR',
  'BHD',
  'JOD',
  'CAD',
  'AUD',
] as const;

export type ForeignCurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_MARKUP_PERCENT = 40;
export const MARKUP_MIN = 0;
export const MARKUP_MAX = 200;

export interface RoundingRule {
  readonly step: number;
  readonly decimals: number;
}

const WHOLE: RoundingRule = { step: 1, decimals: 0 };
const HALF: RoundingRule = { step: 0.5, decimals: 1 };

/** Always round up. Whole units for most currencies, 0.5 steps for the high-value ones. */
export const ROUNDING: Readonly<Record<ForeignCurrencyCode, RoundingRule>> = {
  USD: WHOLE,
  EUR: WHOLE,
  GBP: WHOLE,
  CAD: WHOLE,
  AUD: WHOLE,
  SAR: WHOLE,
  AED: WHOLE,
  QAR: WHOLE,
  KWD: HALF,
  BHD: HALF,
  OMR: HALF,
  JOD: HALF,
};

export interface PublicCurrencyEntry {
  readonly factor: number;
  readonly step: number;
  readonly decimals: number;
}

export interface PublicCurrencyBody {
  readonly base: 'EGP';
  readonly currencies: Readonly<Record<string, PublicCurrencyEntry>>;
  readonly ratesUpdatedAt: Timestamp;
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
 * and is not stored under its own name.
 */
export function buildPublicCurrencyDoc(
  markupPercent: number,
  rates: Readonly<Record<string, number>>,
  ratesUpdatedAt: Timestamp,
): PublicCurrencyBody {
  const multiplier = 1 + markupPercent / 100;
  const currencies: Record<string, PublicCurrencyEntry> = {};
  for (const code of CURRENCY_CODES) {
    const rate = rates[code];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue;
    const rounding = ROUNDING[code];
    currencies[code] = {
      factor: multiplier * rate,
      step: rounding.step,
      decimals: rounding.decimals,
    };
  }
  return { base: 'EGP', currencies, ratesUpdatedAt };
}
