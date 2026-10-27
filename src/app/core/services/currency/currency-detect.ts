import * as v from 'valibot';
import type { PublicCurrencyMap } from './currency.schema';

const cachedFactorsSchema = v.object({
  factor: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  step: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  decimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4)),
});

const CachedCurrencySchema = v.object({
  savedAt: v.pipe(v.number(), v.finite()),
  currencies: v.record(v.string(), cachedFactorsSchema),
});

/** Keep identical to `CURRENCY_CODES` in `functions/src/intl/currency-config.ts`. */
export const FOREIGN_CURRENCY_CODES = [
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

export const SELECTABLE_CURRENCY_CODES = ['EGP', ...FOREIGN_CURRENCY_CODES] as const;

const STORED_CURRENCY_KEY = 'atteya.cur';
const STORED_DOC_KEY = 'atteya.curDoc';
const DOC_TTL_MS = 24 * 60 * 60 * 1000;

const CURRENCY_LABELS: Readonly<Record<string, string>> = {
  EGP: 'Egypt (EGP)',
  USD: 'US Dollar (USD)',
  EUR: 'Euro (EUR)',
  GBP: 'British Pound (GBP)',
  SAR: 'Saudi Riyal (SAR)',
  AED: 'UAE Dirham (AED)',
  KWD: 'Kuwaiti Dinar (KWD)',
  QAR: 'Qatari Riyal (QAR)',
  OMR: 'Omani Rial (OMR)',
  BHD: 'Bahraini Dinar (BHD)',
  JOD: 'Jordanian Dinar (JOD)',
  CAD: 'Canadian Dollar (CAD)',
  AUD: 'Australian Dollar (AUD)',
};

const EXACT_ZONES: Readonly<Record<string, string>> = {
  'Europe/London': 'GBP',
  'Asia/Riyadh': 'SAR',
  'Asia/Dubai': 'AED',
  'Asia/Kuwait': 'KWD',
  'Asia/Qatar': 'QAR',
  'Asia/Muscat': 'OMR',
  'Asia/Bahrain': 'BHD',
  'Asia/Amman': 'JOD',
};

/** Eurozone capitals, plus the other IANA zones of those same countries. */
const EUROZONE_ZONES = new Set<string>([
  'Europe/Vienna',
  'Europe/Brussels',
  'Europe/Zagreb',
  'Asia/Nicosia',
  'Europe/Nicosia',
  'Europe/Tallinn',
  'Europe/Helsinki',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'Europe/Dublin',
  'Europe/Rome',
  'Europe/Riga',
  'Europe/Vilnius',
  'Europe/Luxembourg',
  'Europe/Malta',
  'Europe/Amsterdam',
  'Europe/Lisbon',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Europe/Bratislava',
  'Europe/Ljubljana',
  'Europe/Madrid',
  'Atlantic/Canary',
  'Africa/Ceuta',
]);

const CANADA_ZONES = new Set<string>([
  'America/St_Johns',
  'America/Halifax',
  'America/Glace_Bay',
  'America/Moncton',
  'America/Goose_Bay',
  'America/Blanc-Sablon',
  'America/Toronto',
  'America/Montreal',
  'America/Nipigon',
  'America/Thunder_Bay',
  'America/Iqaluit',
  'America/Pangnirtung',
  'America/Atikokan',
  'America/Winnipeg',
  'America/Rainy_River',
  'America/Resolute',
  'America/Rankin_Inlet',
  'America/Regina',
  'America/Swift_Current',
  'America/Edmonton',
  'America/Cambridge_Bay',
  'America/Yellowknife',
  'America/Inuvik',
  'America/Creston',
  'America/Dawson_Creek',
  'America/Fort_Nelson',
  'America/Vancouver',
  'America/Whitehorse',
  'America/Dawson',
  'America/Coral_Harbour',
]);

export function currencyLabel(code: string): string {
  return CURRENCY_LABELS[code] ?? code;
}

export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return (SELECTABLE_CURRENCY_CODES as readonly string[]).includes(code) ? code : null;
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
 * First-visit guess. A missing or unreadable timezone stays on EGP.
 * Any other known zone that is not mapped below uses USD.
 * US zones are in that USD group. The guess is never stored.
 */
export function currencyFromTimeZone(timeZone: string | undefined): string {
  if (!timeZone || timeZone === 'Africa/Cairo') return 'EGP';
  const exact = EXACT_ZONES[timeZone];
  if (exact) return exact;
  if (timeZone.startsWith('Australia/')) return 'AUD';
  if (CANADA_ZONES.has(timeZone)) return 'CAD';
  if (EUROZONE_ZONES.has(timeZone)) return 'EUR';
  return 'USD';
}

export function readStoredCurrency(): string | null {
  try {
    return normalizeCurrencyCode(localStorage.getItem(STORED_CURRENCY_KEY));
  } catch {
    return null;
  }
}

export function storeCurrency(code: string): void {
  try {
    localStorage.setItem(STORED_CURRENCY_KEY, code);
  } catch {
    // Private mode and blocked storage still show the choice for this visit.
  }
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
    localStorage.setItem(
      STORED_DOC_KEY,
      JSON.stringify({ savedAt: Date.now(), currencies }),
    );
  } catch {
    // A failed cache write only costs a network read next time.
  }
}
