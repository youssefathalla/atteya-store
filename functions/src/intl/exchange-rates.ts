import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import {
  CURRENCY_CODES,
  DEFAULT_MARKUP_PERCENT,
  buildPublicCurrencyDoc,
  parseMarkup,
} from './currency-config.js';

const RATES_URL = 'https://open.er-api.com/v6/latest/EGP';
const RATES_DOC = 'intlPricing/rates';
const CONFIG_DOC = 'intlPricing/config';
const PUBLIC_DOC = 'settings/currency';
const JUMP_RATIO = 0.5;

export interface FetchedEgpRates {
  readonly rates: Readonly<Record<string, number>>;
  readonly updatedAtUnix: number;
}

export interface RefreshRatesResult {
  readonly ok: boolean;
  readonly fetchedAt: string | null;
  readonly warnings: readonly string[];
  readonly error: string | null;
}

export async function fetchEgpRates(): Promise<FetchedEgpRates> {
  const response = await fetch(RATES_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`The rate provider returned status ${response.status}.`);
  }
  const body: unknown = await response.json();
  return parseRatesPayload(body);
}

/**
 * On any failure the previous rates stay in place. Only the attempt time and
 * the error string are written. A scheduled run also rejects a move of more
 * than 50% against the last good value. A manual refresh accepts that move
 * and returns a warning.
 */
export async function refreshRates(
  db: Firestore,
  options: { readonly manual: boolean },
): Promise<RefreshRatesResult> {
  const ratesRef = db.doc(RATES_DOC);
  const now = Timestamp.now();
  try {
    const fetched = await fetchEgpRates();
    const existing = await ratesRef.get();
    const previous = readStoredRates(existing.data());
    const warnings = rateMoveWarnings(previous, fetched.rates);
    if (warnings.length > 0 && !options.manual) {
      const error = warnings.join(' ');
      await markAttempt(ratesRef, now, error);
      return { ok: false, fetchedAt: null, warnings: [], error };
    }

    const markupPercent = await readMarkupOrDefault(db);
    const providerUpdatedAt = Timestamp.fromMillis(fetched.updatedAtUnix * 1000);
    const batch = db.batch();
    batch.set(ratesRef, {
      base: 'EGP',
      rates: { ...fetched.rates },
      provider: 'open.er-api.com',
      providerUpdatedAt,
      fetchedAt: now,
      lastAttemptAt: now,
      lastError: null,
    });
    queuePublicCurrency(batch, db, markupPercent, fetched.rates, providerUpdatedAt, now);
    await batch.commit();
    return {
      ok: true,
      fetchedAt: now.toDate().toISOString(),
      warnings,
      error: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not refresh exchange rates.';
    await markAttempt(ratesRef, now, message);
    return { ok: false, fetchedAt: null, warnings: [], error: message };
  }
}

export async function readMarkupOrDefault(db: Firestore): Promise<number> {
  const snap = await db.doc(CONFIG_DOC).get();
  return parseMarkup(snap.data()?.['markupPercent']) ?? DEFAULT_MARKUP_PERCENT;
}

export function readStoredRates(
  data: DocumentData | undefined,
): Readonly<Record<string, number>> | null {
  if (!data) return null;
  const raw = data['rates'];
  if (!isRecord(raw)) return null;
  const rates: Record<string, number> = {};
  for (const code of CURRENCY_CODES) {
    const value = raw[code];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }
  return Object.keys(rates).length > 0 ? rates : null;
}

export function readTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

export function queuePublicCurrency(
  batch: WriteBatch,
  db: Firestore,
  markupPercent: number,
  rates: Readonly<Record<string, number>>,
  ratesUpdatedAt: Timestamp,
  updatedAt: Timestamp,
): void {
  const body = buildPublicCurrencyDoc(markupPercent, rates, ratesUpdatedAt);
  batch.set(db.doc(PUBLIC_DOC), { ...body, updatedAt });
}

export function rateMoveWarnings(
  previous: Readonly<Record<string, number>> | null,
  next: Readonly<Record<string, number>>,
): string[] {
  if (!previous) return [];
  const warnings: string[] = [];
  for (const code of CURRENCY_CODES) {
    const before = previous[code];
    const after = next[code];
    if (typeof before !== 'number' || !(before > 0) || typeof after !== 'number') continue;
    if (Math.abs(after - before) / before > JUMP_RATIO) {
      warnings.push(`${code} moved more than 50% since the last update.`);
    }
  }
  return warnings;
}

async function markAttempt(
  ratesRef: DocumentReference,
  now: Timestamp,
  lastError: string,
): Promise<void> {
  await ratesRef.set(
    {
      lastAttemptAt: now,
      lastError,
    },
    { merge: true },
  );
}

function parseRatesPayload(body: unknown): FetchedEgpRates {
  if (!isRecord(body)) {
    throw new Error('The rate provider returned an unexpected response.');
  }
  if (body['result'] !== 'success') {
    throw new Error('The rate provider did not return rates.');
  }
  if (body['base_code'] !== 'EGP') {
    throw new Error('The rate provider did not use EGP as the base.');
  }
  const updatedAtUnix = body['time_last_update_unix'];
  if (typeof updatedAtUnix !== 'number' || !Number.isFinite(updatedAtUnix) || updatedAtUnix <= 0) {
    throw new Error('The rate provider did not include an update time.');
  }
  return { rates: readWhitelist(body['rates']), updatedAtUnix };
}

function readWhitelist(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) {
    throw new Error('The rate provider did not include a rate table.');
  }
  const rates: Record<string, number> = {};
  for (const code of CURRENCY_CODES) {
    const value = raw[code];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`The rate provider did not include a usable ${code} rate.`);
    }
    rates[code] = value;
  }
  return rates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
