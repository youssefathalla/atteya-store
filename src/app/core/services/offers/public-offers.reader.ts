import { Service } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
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
      query(this.#col, where('active', '==', true), where('visibility', '==', 'public'), limit(100)),
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

  /**
   * One offer by id (the bundle page, ATS-279). Null when it doesn't exist, can't be read (rules
   * allow only active public offers, so a paused or code offer reads as missing), or doesn't parse.
   * Other read failures throw.
   */
  async fetchPublicById(id: string): Promise<Offer | null> {
    try {
      const snap = await getDoc(doc(this.#col, id));
      if (!snap.exists()) return null;
      const parsed = v.safeParse(OfferDocSchema, { ...snap.data(), id: snap.id });
      return parsed.success ? toEngineOffer(parsed.output) : null;
    } catch (error: unknown) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
  }
}
