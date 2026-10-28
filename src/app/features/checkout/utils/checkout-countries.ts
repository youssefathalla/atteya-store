/** ISO 3166-1 alpha-2 codes supported at international bank-transfer checkout (Egypt uses COD later). */
export const CHECKOUT_COUNTRY_OPTIONS: readonly { readonly code: string; readonly label: string }[] =
  [
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

export function countryLabel(code: string): string {
  return CHECKOUT_COUNTRY_OPTIONS.find((entry) => entry.code === code)?.label ?? code;
}
