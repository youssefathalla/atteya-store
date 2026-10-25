import { Service } from '@angular/core';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import type { Offer } from './engine';
import { OFFERS_COLLECTION, toEngineOffer } from './offer.model';
import { OfferDocSchema } from './offer.schema';

/**
 * One-shot read of active public offers without opening a realtime listener.
 * Uses the exact filters required by Firestore rules (`active == true && visibility == 'public'`),
 * and parses each document with `v.safeParse` so one invalid document cannot fail the read.
 */
@Service()
export class PublicOffersReader {
  readonly #col = collection(injectFirestore(), OFFERS_COLLECTION);

  async fetchActivePublic(): Promise<readonly Offer[]> {
    const snap = await getDocs(
      query(
        this.#col,
        where('active', '==', true),
        where('visibility', '==', 'public'),
        limit(100),
      ),
    );
    const offers: Offer[] = [];
    for (const docSnap of snap.docs) {
      const parsed = v.safeParse(OfferDocSchema, { ...docSnap.data(), id: docSnap.id });
      if (!parsed.success) continue;
      const offer = toEngineOffer(parsed.output);
      if (!offer.archived) {
        offers.push(offer);
      }
    }
    return offers;
  }
}
