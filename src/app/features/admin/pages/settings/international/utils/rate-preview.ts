import { displayDecimals, toDisplayAmount, type CurrencyEntry } from '@core/services/offers/engine';
import { formatMoney } from '@shared/utils/money';

export interface RatePreviewRow {
  readonly code: string;
  readonly perEgp: string;
  /** 1,000 EGP converted at the plain rate, no markup, same rounding. */
  readonly baseAs: string;
  /** What the markup adds: the price with markup minus the price before it. */
  readonly markupAs: string;
  /** 1,000 EGP with the markup added: what shoppers see. */
  readonly showsAs: string;
}

export interface IntlPageData {
  readonly markupPercent: number;
  readonly rates: Readonly<Record<string, number>>;
  readonly fetchedAt: Date | null;
  readonly providerUpdatedAt: Date | null;
  readonly lastError: string | null;
}

const SAMPLE_EGP = 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export function ratePreviewRows(
  rates: Readonly<Record<string, number>>,
  markupPercent: number,
): readonly RatePreviewRow[] {
  const rows: RatePreviewRow[] = [];
  for (const code of Object.keys(rates).sort()) {
    if (!/^[A-Z]{3}$/.test(code) || code === 'EGP') continue;
    const rate = rates[code];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue;
    const decimals = displayDecimals(code);
    const base = sampleAmount(code, 0, rate);
    const withMarkup = sampleAmount(code, markupPercent, rate);
    rows.push({
      code,
      perEgp: rate.toLocaleString('en-US', { maximumSignificantDigits: 6 }),
      baseAs: formatMoney(base, code, decimals),
      markupAs: `+${formatMoney(Math.max(0, withMarkup - base), code, decimals)}`,
      showsAs: formatMoney(withMarkup, code, decimals),
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

function sampleAmount(code: string, markupPercent: number, rate: number): number {
  const entry: CurrencyEntry = {
    code,
    factor: (1 + markupPercent / 100) * rate,
  };
  return toDisplayAmount(SAMPLE_EGP, entry);
}
