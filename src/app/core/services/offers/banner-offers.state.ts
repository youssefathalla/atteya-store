import { makeStateKey } from '@angular/core';
import type { TransferOffer } from './offer-transfer';

/** Offers with the top banner on, read once on the server for the first HTML (epoch-ms dates). */
export const BANNER_OFFERS_KEY = makeStateKey<readonly TransferOffer[] | null>('banner-offers');

/** Most banner offers the server reads (the bar shows at most 4 after its own checks). */
export const BANNER_OFFERS_READ_LIMIT = 20;
