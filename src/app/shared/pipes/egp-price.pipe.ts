import { Pipe, PipeTransform } from '@angular/core';
import { formatMoney } from '@shared/utils/money';

/**
 * Formats a whole Egyptian pound amount.
 * Example: 599 → "EGP 599". Do not use this for the legacy GBP pence pipe.
 * Admin screens keep this pipe. The storefront formats through `formatMoney`.
 */
@Pipe({ name: 'egpPrice', pure: true })
export class EgpPricePipe implements PipeTransform {
  transform(amount: number | null): string {
    if (amount === null || !Number.isFinite(amount)) return '';
    return formatMoney(amount, 'EGP', 0);
  }
}
