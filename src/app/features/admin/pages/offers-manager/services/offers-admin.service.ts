import { inject, Service } from '@angular/core';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import type { Offer, OfferDraft } from '@core/services/offers/engine';
import { OFFER_CODES_COLLECTION, OFFERS_COLLECTION, toEngineOffer } from '@core/services/offers/offer.model';
import { OfferCodeDocSchema, OfferDocSchema } from '@core/services/offers/offer.schema';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { withoutStackSaleItems } from '../models/offer-admin.model';

@Service()
export class OffersAdminService {
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);

  async listOffers(): Promise<readonly Offer[]> {
    const offersCol = collection(this.#firestore, OFFERS_COLLECTION).withConverter(
      createValibotConverter(OfferDocSchema),
    );
    const codesCol = collection(this.#firestore, OFFER_CODES_COLLECTION).withConverter(
      createValibotConverter(OfferCodeDocSchema),
    );

    const [offersSnap, codesSnap] = await Promise.all([
      getDocs(query(offersCol, orderBy('updatedAt', 'desc'), limit(200))),
      getDocs(query(codesCol, limit(200))),
    ]);

    const codesById = new Map<string, string>();
    for (const codeDoc of codesSnap.docs) {
      codesById.set(codeDoc.id, codeDoc.data().code);
    }

    return offersSnap.docs.map((item) => {
      const data = item.data();
      return toEngineOffer(data, codesById.get(item.id) ?? null);
    });
  }

  async getOffer(offerId: string): Promise<Offer | null> {
    const offerRef = doc(this.#firestore, OFFERS_COLLECTION, offerId).withConverter(
      createValibotConverter(OfferDocSchema),
    );
    const codeRef = doc(this.#firestore, OFFER_CODES_COLLECTION, offerId).withConverter(
      createValibotConverter(OfferCodeDocSchema),
    );

    const [offerSnap, codeSnap] = await Promise.all([getDoc(offerRef), getDoc(codeRef)]);
    if (!offerSnap.exists()) return null;

    const code = codeSnap.exists() ? codeSnap.data().code : null;
    return toEngineOffer(offerSnap.data(), code);
  }

  async saveOffer(draft: OfferDraft): Promise<string> {
    const uid = this.#auth.user()?.uid ?? 'admin';
    const isNew = !draft.id;
    const offerRef = isNew
      ? doc(collection(this.#firestore, OFFERS_COLLECTION))
      : doc(this.#firestore, OFFERS_COLLECTION, draft.id!);
    const offerId = offerRef.id;
    const codeRef = doc(this.#firestore, OFFER_CODES_COLLECTION, offerId);

    const requiresCode = Boolean(draft.requiresCode && draft.code?.trim());
    const visibility = requiresCode ? 'code' : 'public';
    const normalizedCode = draft.code?.trim().toUpperCase() ?? '';

    const isGift = draft.reward.kind === 'freeGift';
    const payload: Record<string, unknown> = {
      id: offerId,
      name: draft.name.trim(),
      title: draft.title.trim(),
      badge: draft.badge?.trim() || null,
      description: draft.description?.trim() || null,
      active: draft.active,
      archived: draft.archived,
      visibility,
      audience: draft.audience,
      schedule: {
        startsAt: draft.schedule.startsAt ? Timestamp.fromDate(draft.schedule.startsAt) : null,
        endsAt: draft.schedule.endsAt ? Timestamp.fromDate(draft.schedule.endsAt) : null,
        timezone: 'Africa/Cairo',
      },
      priority: Math.max(-100, Math.min(100, Math.round(draft.priority))),
      stacking: draft.stacking,
      saleItems: withoutStackSaleItems(draft).saleItems,
      // A Free gift offer gives one set of gifts per qualifying item, so it is never a cart offer.
      scope: isGift ? 'item' : draft.scope,
      conditions: draft.conditions,
      exclude: draft.exclude,
      minimum: isGift ? null : draft.minimum,
      // The merge would keep an old one-product gift's fields next to `gifts`; drop them.
      reward: isGift
        ? {
            ...draft.reward,
            giftProductId: deleteField(),
            giftVariantId: deleteField(),
            quantity: deleteField(),
          }
        : draft.reward,
      limits: draft.limits,
      requiresCode,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    };

    if (isNew) {
      payload['createdAt'] = serverTimestamp();
    }

    const batch = writeBatch(this.#firestore);
    batch.set(offerRef, payload, { merge: true });

    if (requiresCode && normalizedCode) {
      batch.set(codeRef, {
        id: offerId,
        code: normalizedCode,
        codeNormalized: normalizedCode,
      });
    } else {
      batch.delete(codeRef);
    }

    await batch.commit();
    return offerId;
  }

  async duplicateOffer(source: Offer): Promise<string> {
    const copyDraft: OfferDraft = {
      ...source,
      id: undefined,
      name: `${source.name} (copy)`.slice(0, 80),
      active: false,
      archived: false,
      visibility: 'public',
      requiresCode: false,
      code: null,
    };
    return this.saveOffer(copyDraft);
  }

  async setOfferActive(offerId: string, active: boolean): Promise<void> {
    const uid = this.#auth.user()?.uid ?? 'admin';
    await updateDoc(doc(this.#firestore, OFFERS_COLLECTION, offerId), {
      active,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  }

  async setOfferArchived(offerId: string, archived: boolean): Promise<void> {
    const uid = this.#auth.user()?.uid ?? 'admin';
    await updateDoc(doc(this.#firestore, OFFERS_COLLECTION, offerId), {
      archived,
      ...(archived ? { active: false } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  }

  async deleteArchivedOffer(offerId: string): Promise<void> {
    const batch = writeBatch(this.#firestore);
    batch.delete(doc(this.#firestore, OFFERS_COLLECTION, offerId));
    batch.delete(doc(this.#firestore, OFFER_CODES_COLLECTION, offerId));
    await batch.commit();
  }
}
