import { displayDecimals, isUnreliableCurrency, toDisplayAmount, type CurrencyEntry } from '../offers/engine/currency.js';
import type { OrderLinePrice, OrderPayIn, OrderShippingLine } from './order-pricing.server.js';

/** The currency a Bank Transfer falls back to when checkout sent none or one we can't use. */
export const PAY_IN_FALLBACK_CURRENCY = 'USD';

/**
 * The currency a Bank Transfer order is paid in: the one checkout showed (`requested`) when
 * `settings/currency` has a usable factor for it, else USD. Null when neither has a factor (the
 * order is then refused: we can't say how much to send). Never EGP: Bank Transfer is abroad only.
 */
export function payInEntry(
  requested: string | null,
  currencies: Readonly<Record<string, unknown>>,
): CurrencyEntry | null {
  const usable = (code: string | null): CurrencyEntry | null => {
    if (!code || code === 'EGP' || isUnreliableCurrency(code)) return null;
    const entry = currencies[code];
    if (!entry || typeof entry !== 'object') return null;
    const factor = (entry as Record<string, unknown>)['factor'];
    return typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? { code, factor } : null;
  };
  return usable(requested) ?? usable(PAY_IN_FALLBACK_CURRENCY);
}

/**
 * The order total in the shopper's currency, added up exactly as checkout adds it up, so the
 * amount to send matches what checkout showed: each line converted on its own (pieces in a Buy X
 * Get Y group as a whole line, the others unit price × quantity; free gifts 0), then the shipping
 * fee, each with `toDisplayAmount()`'s rounding.
 */
export function payInFor(
  lines: readonly Pick<OrderLinePrice, 'unitEgp' | 'quantity' | 'lineDisplay' | 'fullEgp' | 'gift'>[],
  shipping: Pick<OrderShippingLine, 'priceEgp'> | null,
  entry: CurrencyEntry,
): OrderPayIn {
  let amount = 0;
  for (const line of lines) {
    if (line.gift) continue;
    amount +=
      line.fullEgp !== undefined
        ? toDisplayAmount(line.lineDisplay, entry)
        : toDisplayAmount(line.unitEgp, entry) * line.quantity;
  }
  amount += toDisplayAmount(shipping?.priceEgp ?? 0, entry);
  const decimals = displayDecimals(entry.code);
  return { currency: entry.code, amount: Number(amount.toFixed(decimals)) };
}
