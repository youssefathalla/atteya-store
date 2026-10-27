// GENERATED — edit functions/src/offers/engine
export interface CurrencyEntry {
  readonly code: string;
  readonly factor: number;
}

export const EGP_ENTRY: CurrencyEntry = { code: 'EGP', factor: 1 };

/** Official rates for these codes are too unreliable to show. Detection uses USD instead. */
export const UNRELIABLE_CURRENCIES = ['LBP', 'SYP', 'YER', 'SDG', 'VES', 'ZWL', 'IRR'] as const;

/** ISO minor units are 3. Other currencies stay on whole numbers. */
export const HIGH_VALUE_CURRENCIES = ['KWD', 'BHD', 'OMR', 'JOD'] as const;

const UNRELIABLE = new Set<string>(UNRELIABLE_CURRENCIES);
const HIGH_VALUE = new Set<string>(HIGH_VALUE_CURRENCIES);

export function isUnreliableCurrency(code: string): boolean {
  return UNRELIABLE.has(code);
}

export function displayDecimals(code: string): number {
  return HIGH_VALUE.has(code) ? 3 : 0;
}

/**
 * Converts a whole Egyptian pound amount into the visitor's currency.
 * EGP is returned unchanged. Every other currency rounds up to a clean step
 * near 1.5% of the converted amount (at least 1, or 0.001 for KWD, BHD, OMR, and JOD).
 */
export function toDisplayAmount(egp: number, entry: CurrencyEntry): number {
  if (!Number.isFinite(egp)) return 0;
  if (entry.code === 'EGP') return egp;
  if (!(entry.factor > 0)) return egp;
  const raw = egp * entry.factor;
  const step = roundingStep(raw, entry.code);
  const decimals = displayDecimals(entry.code);
  const scaled = Math.ceil(raw / step - 1e-9) * step;
  return Number(scaled.toFixed(decimals));
}

function roundingStep(raw: number, code: string): number {
  const minStep = HIGH_VALUE.has(code) ? 0.001 : 1;
  if (!(raw > 0)) return minStep;
  return Math.max(minStep, niceStep(raw * 0.015));
}

/** Largest 1, 2, or 5 × 10^n that stays at or under the target. */
function niceStep(target: number): number {
  if (!(target > 0)) return 1;
  const exp = Math.floor(Math.log10(target));
  const base = 10 ** exp;
  const n = target / base;
  const magnitude = n < 2 ? 1 : n < 5 ? 2 : 5;
  const step = magnitude * base;
  return exp < 0 ? Number(step.toFixed(Math.min(6, -exp))) : step;
}
