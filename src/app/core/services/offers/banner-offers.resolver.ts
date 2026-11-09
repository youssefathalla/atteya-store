import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { BANNER_OFFERS_KEY, BANNER_OFFERS_READ_LIMIT } from './banner-offers.state';
import { OFFERS_COLLECTION, toEngineOffer } from './offer.model';
import { OfferDocSchema } from './offer.schema';
import { toTransferOffer, type TransferOffer } from './offer-transfer';

/**
 * One server read of the offers staff put in the top banner, so the announcement bar ships in the
 * first HTML (same client SDK path as `shippingSettingsResolver`; the browser then follows
 * `OffersService`). The query keeps the filters the rules need (`active`, `visibility`); each
 * document is parsed on its own so one bad offer can't drop the others.
 */
export const bannerOffersResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;

  const transfer = inject(TransferState);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  try {
    const snap = await getDocs(
      query(
        collection(injectFirestore(), OFFERS_COLLECTION),
        where('active', '==', true),
        where('visibility', '==', 'public'),
        where('banner.show', '==', true),
        limit(BANNER_OFFERS_READ_LIMIT),
      ),
    );
    const offers: TransferOffer[] = [];
    for (const docSnap of snap.docs) {
      const parsed = v.safeParse(OfferDocSchema, { ...docSnap.data(), id: docSnap.id });
      if (!parsed.success) continue;
      const offer = toEngineOffer(parsed.output);
      if (!offer.archived) offers.push(toTransferOffer(offer));
    }
    transfer.set(BANNER_OFFERS_KEY, offers);
  } catch {
    transfer.set(BANNER_OFFERS_KEY, null);
    if (responseInit) {
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
  }
};
