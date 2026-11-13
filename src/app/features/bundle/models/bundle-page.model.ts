import type { TransferOffer } from '@core/services/offers/offer-transfer';

/** What the bundle page's resolver hands the page (JSON-safe, sent from server to browser). */
export type BundlePageResult =
  | {
      readonly status: 'found';
      /** The Bundle & Save offer (any state: the page explains an ended or upcoming one). */
      readonly offer: TransferOffer;
      /** Clock used for the first render (server render time, or client time on client navigation). */
      readonly renderedAtMs: number;
    }
  /** No such offer, one shoppers can't read (paused, code only), or not a Bundle & Save offer. */
  | { readonly status: 'missing' }
  /** The read failed. */
  | { readonly status: 'error' };
