import { Pipe, PipeTransform } from '@angular/core';

const EGP_FORMATTER = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

/**
 * Formats a whole Egyptian pound amount.
 * Example: 599 → "EGP 599". Do not use this for the legacy GBP pence pipe.
 */
@Pipe({ name: 'egpPrice', pure: true })
export class EgpPricePipe implements PipeTransform {
  transform(amount: number | null): string {
    if (amount === null || !Number.isFinite(amount)) return '';
    return EGP_FORMATTER.format(amount);
  }
}
