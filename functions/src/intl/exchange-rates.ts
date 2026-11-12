import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  DEFAULT_MARKUP_PERCENT,
  buildPublicCurrencyDoc,
  isForeignCurrencyCode,
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
 * the error string are written. A scheduled run keeps the previous value for
 * any code that moved more than 50% and still saves the rest. A manual refresh
 * accepts that move and returns a warning.
 */
export async function refreshRates(
  db: Firestore,
  options: { readonly manual: boolean },
): Promise<RefreshRatesResult> {
  const ratesRef = db.doc(RATES_DOC);
  const now = Timestamp.now();
  try {
    const fetched = await fetchEgpRates();
    const providerUpdatedAt = Timestamp.fromMillis(fetched.updatedAtUnix * 1000);
    // Read rates + markup and write both docs in one transaction, so a markup save at the same
    // moment can never leave settings/currency built from mixed inputs.
    const warnings = await db.runTransaction(async (tx) => {
      const [existing, configSnap] = await tx.getAll(ratesRef, db.doc(CONFIG_DOC));
      const storedProviderAt = readTimestamp(existing.data()?.['providerUpdatedAt']);
      if (storedProviderAt && storedProviderAt.toMillis() > providerUpdatedAt.toMillis()) {
        // A newer refresh already saved later rates: never roll them back with this older fetch.
        tx.set(ratesRef, { lastAttemptAt: now }, { merge: true });
        return [];
      }
      const previous = readStoredRates(existing.data());
      const guarded = applyJumpGuard(previous, fetched.rates, options.manual);
      const markupPercent = markupOrDefault(configSnap.data());
      tx.set(ratesRef, {
        base: 'EGP',
        rates: guarded.rates,
        provider: 'open.er-api.com',
        providerUpdatedAt,
        fetchedAt: now,
        lastAttemptAt: now,
        lastError: guarded.warnings.length > 0 ? guarded.warnings.join(' ') : null,
        rateCount: Object.keys(guarded.rates).length,
      });
      setPublicCurrency(tx, db, markupPercent, guarded.rates, providerUpdatedAt, now);
      return guarded.warnings;
    });
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

function markupOrDefault(data: DocumentData | undefined): number {
  return parseMarkup(data?.['markupPercent']) ?? DEFAULT_MARKUP_PERCENT;
}

export function readStoredRates(data: DocumentData | undefined): Readonly<Record<string, number>> | null {
  if (!data) return null;
  const raw = data['rates'];
  if (!isRecord(raw)) return null;
  return readPositiveRates(raw);
}

export function readTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

export function setPublicCurrency(
  tx: Transaction,
  db: Firestore,
  markupPercent: number,
  rates: Readonly<Record<string, number>>,
  ratesUpdatedAt: Timestamp,
  updatedAt: Timestamp,
): void {
  const body = buildPublicCurrencyDoc(markupPercent, rates, ratesUpdatedAt);
  tx.set(db.doc(PUBLIC_DOC), { ...body, updatedAt });
}

export function applyJumpGuard(
  previous: Readonly<Record<string, number>> | null,
  next: Readonly<Record<string, number>>,
  manual: boolean,
): { rates: Record<string, number>; warnings: string[] } {
  const rates: Record<string, number> = { ...next };
  if (!previous) return { rates, warnings: [] };
  const warnings: string[] = [];
  for (const [code, after] of Object.entries(next)) {
    const before = previous[code];
    if (typeof before !== 'number' || !(before > 0)) continue;
    if (Math.abs(after - before) / before <= JUMP_RATIO) continue;
    if (!manual) rates[code] = before;
    warnings.push(
      manual
        ? `${code} moved more than 50% since the last update.`
        : `${code} moved more than 50% since the last update. The previous rate was kept.`,
    );
  }
  return { rates, warnings };
}

async function markAttempt(ratesRef: DocumentReference, now: Timestamp, lastError: string): Promise<void> {
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
  const rates = readPositiveRates(body['rates']);
  if (!rates || Object.keys(rates).length < 10) {
    throw new Error('The rate provider did not include a usable rate table.');
  }
  return { rates, updatedAtUnix };
}

function readPositiveRates(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw)) {
    if (!isForeignCurrencyCode(code)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    rates[code] = value;
  }
  return Object.keys(rates).length > 0 ? rates : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
