import * as v from 'valibot';
import { isUnreliableCurrency } from '@core/services/offers/engine';
import { COUNTRY_CURRENCY } from './country-currency';
import type { PublicCurrencyMap } from './currency.schema';

const cachedFactorsSchema = v.object({
  factor: v.pipe(v.number(), v.finite(), v.gtValue(0)),
});

const CachedCurrencySchema = v.object({
  savedAt: v.pipe(v.number(), v.finite()),
  currencies: v.record(v.string(), cachedFactorsSchema),
});

const STORED_DOC_KEY = 'atteya.curDoc';
const DOC_TTL_MS = 24 * 60 * 60 * 1000;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/** `?cur=` test override. EGP or any 3-letter code. Never stored. */
export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code === 'EGP') return code;
  return CURRENCY_CODE.test(code) ? code : null;
}

export function readTimeZone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz !== 'string') return undefined;
    const trimmed = tz.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ISO country → display currency from CLDR tender data.
 * Egypt, and a visitor whose country could not be found, get EGP.
 * Unknown or unreliable currency codes become USD.
 */
export function currencyFromCountry(country: string | null | undefined): string {
  if (!country) return 'EGP';
  const iso = country.trim().toUpperCase();
  if (iso === 'EG') return 'EGP';
  const code = COUNTRY_CURRENCY[iso];
  if (!code || isUnreliableCurrency(code)) return 'USD';
  return code;
}

/**
 * @deprecated Timezone inference replaced by IP/geo country. Kept for tooling only.
 */
export async function currencyFromTimeZone(timeZone: string | undefined): Promise<string> {
  if (timeZone === 'Africa/Cairo') return 'EGP';
  if (!timeZone) return 'USD';
  const { TZ_CURRENCY } = await import('./tz-currency');
  const code = TZ_CURRENCY[timeZone];
  if (!code || isUnreliableCurrency(code)) return 'USD';
  return code;
}

export function readCachedCurrencyMap(maxAgeMs: number | null): PublicCurrencyMap | null {
  try {
    const raw = localStorage.getItem(STORED_DOC_KEY);
    if (!raw) return null;
    const parsed = v.safeParse(CachedCurrencySchema, JSON.parse(raw) as unknown);
    if (!parsed.success) return null;
    if (maxAgeMs !== null && Date.now() - parsed.output.savedAt > maxAgeMs) return null;
    return parsed.output.currencies;
  } catch {
    return null;
  }
}

export function readFreshCurrencyMap(): PublicCurrencyMap | null {
  return readCachedCurrencyMap(DOC_TTL_MS);
}

export function storeCachedCurrencyMap(currencies: PublicCurrencyMap): void {
  try {
    localStorage.setItem(STORED_DOC_KEY, JSON.stringify({ savedAt: Date.now(), currencies }));
  } catch {
    // A failed cache write only costs a network read next time.
  }
}
