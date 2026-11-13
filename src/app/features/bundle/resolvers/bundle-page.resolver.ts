import { isPlatformServer } from '@angular/common';
import { inject, makeStateKey, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { toTransferOffer } from '@core/services/offers/offer-transfer';
import { PublicOffersReader } from '@core/services/offers/public-offers.reader';
import { markNotFound } from '@shared/utils/error-response';
import type { BundlePageResult } from '../models/bundle-page.model';

/** Offer ids are Firestore ids: letters, digits, `-` and `_`. */
const OFFER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Reads the Bundle & Save offer of `/bundle/:offerId` (ATS-279) once, on the server, and hands it to
 * the browser through TransferState. A missing offer, one shoppers can't read, or any other kind of
 * offer answers 404 (Page Not Found); a failed read 503. Both with `private, no-store`.
 */
export const bundlePageResolver: ResolveFn<BundlePageResult> = async (route) => {
  const reader = inject(PublicOffersReader);
  const transfer = inject(TransferState);
  const isServer = isPlatformServer(inject(PLATFORM_ID));
  const responseInit = inject(RESPONSE_INIT, { optional: true });

  const offerId = (route.paramMap.get('offerId') ?? '').trim();
  const key = makeStateKey<BundlePageResult>(`bundle-page:${offerId}`);

  if (!isServer && transfer.hasKey(key)) {
    const cached = transfer.get(key, { status: 'error' });
    transfer.remove(key);
    return cached;
  }

  let result: BundlePageResult;
  if (!OFFER_ID.test(offerId)) {
    result = { status: 'missing' };
  } else {
    try {
      const offer = await reader.fetchPublicById(offerId);
      result =
        offer && offer.reward.kind === 'bundleSet'
          ? { status: 'found', offer: toTransferOffer(offer), renderedAtMs: Date.now() }
          : { status: 'missing' };
    } catch {
      result = { status: 'error' };
    }
  }

  if (isServer) {
    if (responseInit && result.status === 'missing') {
      markNotFound(responseInit);
    } else if (responseInit && result.status === 'error') {
      responseInit.status = 503;
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
    transfer.set(key, result);
  }
  return result;
};
