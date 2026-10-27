const EGP_FORMATTER = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats a money amount. EGP uses the same `en-EG` whole-pound formatter as
 * the admin `egpPrice` pipe. Other currencies use `en-US` with the published
 * fraction digits.
 */
export function formatMoney(amount: number, code: string, decimals: number): string {
  if (!Number.isFinite(amount)) return '';
  if (code === 'EGP') return EGP_FORMATTER.format(amount);
  const digits = Math.min(4, Math.max(0, decimals));
  const key = `${code}:${digits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(amount);
}
