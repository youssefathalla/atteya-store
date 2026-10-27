import { FOREIGN_CURRENCY_CODES } from '@core/services/currency/currency-detect';
import type { PublicCurrencyMap } from '@core/services/currency/currency.schema';
import { toDisplayAmount, type CurrencyEntry } from '@core/services/offers/engine';
import { formatMoney } from '@shared/utils/money';

export interface RatePreviewRow {
  readonly code: string;
  readonly perEgp: string;
  readonly showsAs: string;
}

export interface IntlPageData {
  readonly markupPercent: number;
  readonly rates: Readonly<Record<string, number>>;
  readonly published: PublicCurrencyMap;
  readonly fetchedAt: Date | null;
  readonly providerUpdatedAt: Date | null;
  readonly lastError: string | null;
}

const SAMPLE_EGP = 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export function ratePreviewRows(
  rates: Readonly<Record<string, number>>,
  markupPercent: number,
  published: PublicCurrencyMap,
): readonly RatePreviewRow[] {
  const rows: RatePreviewRow[] = [];
  for (const code of FOREIGN_CURRENCY_CODES) {
    const rate = rates[code];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue;
    const rounding = published[code];
    rows.push({
      code,
      perEgp: rate.toLocaleString('en-US', { maximumSignificantDigits: 6 }),
      showsAs: rounding ? samplePrice(code, markupPercent, rate, rounding) : '—',
    });
  }
  return rows;
}

export function ratesAreStale(fetchedAt: Date | null, now = Date.now()): boolean {
  if (!fetchedAt) return false;
  return now - fetchedAt.getTime() > STALE_MS;
}

export function markupError(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 200) {
    return 'Enter a markup from 0 to 200, with at most one decimal place.';
  }
  const scaled = Math.round(value * 10);
  if (Math.abs(value * 10 - scaled) > 1e-6) {
    return 'Enter a markup from 0 to 200, with at most one decimal place.';
  }
  return null;
}

export function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'object' && 'toDate' in raw && typeof raw.toDate === 'function') {
    const date = raw.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function callableMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error && 'code' in error) {
    const message = error.message;
    const code = error.code;
    if (typeof message === 'string' && typeof code === 'string' && code.startsWith('functions/')) {
      const bare = code.slice('functions/'.length);
      const normalized = message.trim().toLowerCase();
      const isStatus =
        normalized === bare || normalized.startsWith(`${bare} (`) || normalized.startsWith(`${bare}:`);
      if (message.trim().length > 0 && !isStatus) return message;
    }
  }
  return fallback;
}

function samplePrice(
  code: string,
  markupPercent: number,
  rate: number,
  rounding: { readonly step: number; readonly decimals: number },
): string {
  const entry: CurrencyEntry = {
    code,
    factor: (1 + markupPercent / 100) * rate,
    step: rounding.step,
    decimals: rounding.decimals,
  };
  return formatMoney(toDisplayAmount(SAMPLE_EGP, entry), code, rounding.decimals);
}
