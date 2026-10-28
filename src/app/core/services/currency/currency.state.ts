import { makeStateKey } from '@angular/core';
import type { PublicCurrencyMap } from './currency.schema';

/** Geo + display currency resolved on the server for TransferState. */
export interface CurrencyBootTransfer {
  readonly country: string | null;
  readonly code: string;
  readonly map: PublicCurrencyMap | null;
}

export const CURRENCY_BOOT_KEY = makeStateKey<CurrencyBootTransfer>('currency-boot');
