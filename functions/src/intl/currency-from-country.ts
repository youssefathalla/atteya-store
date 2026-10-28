import { isUnreliableCurrency } from '../offers/engine/index.js';
import { COUNTRY_CURRENCY } from './country-currency.generated.js';

/** ISO country → display currency (CLDR tender). Mirrors `currencyFromCountry` in Angular. */
export function currencyFromCountry(country: string): string {
  const iso = country.trim().toUpperCase();
  if (iso === 'EG') return 'EGP';
  const code = COUNTRY_CURRENCY[iso];
  if (!code || isUnreliableCurrency(code)) return 'USD';
  return code;
}
