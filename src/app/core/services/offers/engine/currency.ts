// GENERATED — edit functions/src/offers/engine
export interface CurrencyEntry {
  readonly code: string;
  readonly factor: number;
  readonly step: number;
  readonly decimals: number;
}

export const EGP_ENTRY: CurrencyEntry = { code: 'EGP', factor: 1, step: 1, decimals: 0 };

/**
 * Converts a whole Egyptian pound amount into the visitor's currency.
 * EGP is returned unchanged. Every other currency rounds up to `step`,
 * then trims binary float noise to `decimals`.
 */
export function toDisplayAmount(egp: number, entry: CurrencyEntry): number {
  if (!Number.isFinite(egp)) return 0;
  if (entry.code === 'EGP') return egp;
  if (!(entry.factor > 0) || !(entry.step > 0)) return egp;
  const scaled = Math.ceil((egp * entry.factor) / entry.step) * entry.step;
  return Number(scaled.toFixed(entry.decimals));
}
