/** ISO 3166-1 alpha-2 codes supported at checkout. Egypt enables cash on delivery. */
export const CHECKOUT_COUNTRY_OPTIONS: readonly { readonly code: string; readonly label: string }[] = [
  { code: 'EG', label: 'Egypt' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'AU', label: 'Australia' },
  { code: 'BH', label: 'Bahrain' },
  { code: 'CA', label: 'Canada' },
  { code: 'DE', label: 'Germany' },
  { code: 'ES', label: 'Spain' },
  { code: 'FR', label: 'France' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'IT', label: 'Italy' },
  { code: 'JO', label: 'Jordan' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'OM', label: 'Oman' },
  { code: 'QA', label: 'Qatar' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'US', label: 'United States' },
] as const;

export type CheckoutCountryCode = (typeof CHECKOUT_COUNTRY_OPTIONS)[number]['code'];

export function isCheckoutCountry(code: string): code is CheckoutCountryCode {
  return CHECKOUT_COUNTRY_OPTIONS.some((entry) => entry.code === code);
}

export function countryLabel(code: string): string {
  return CHECKOUT_COUNTRY_OPTIONS.find((entry) => entry.code === code)?.label ?? code;
}

/** Exact match on ISO code or full country label (for live typing). */
export function matchCheckoutCountryExact(query: string): CheckoutCountryCode | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;
  const exactCode = CHECKOUT_COUNTRY_OPTIONS.find((entry) => entry.code.toLowerCase() === trimmed);
  if (exactCode) return exactCode.code;
  const exactLabel = CHECKOUT_COUNTRY_OPTIONS.find((entry) => entry.label.toLowerCase() === trimmed);
  return exactLabel?.code ?? null;
}

/**
 * Resolve a typed query to one checkout country: exact code/label first,
 * then a unique partial label/code match (for blur commit).
 */
export function matchCheckoutCountry(query: string): CheckoutCountryCode | null {
  const exact = matchCheckoutCountryExact(query);
  if (exact) return exact;
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;
  const partial = CHECKOUT_COUNTRY_OPTIONS.filter(
    (entry) => entry.label.toLowerCase().includes(trimmed) || entry.code.toLowerCase().includes(trimmed),
  );
  return partial.length === 1 ? partial[0].code : null;
}

export function filterCheckoutCountries(
  query: string,
): readonly { readonly code: string; readonly label: string }[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return CHECKOUT_COUNTRY_OPTIONS;
  return CHECKOUT_COUNTRY_OPTIONS.filter(
    (entry) => entry.label.toLowerCase().includes(trimmed) || entry.code.toLowerCase().includes(trimmed),
  );
}
