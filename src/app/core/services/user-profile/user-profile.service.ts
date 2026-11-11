import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import {
  CURRENT_TERMS_VERSION,
  USERS_COLLECTION,
  type ProfileDetails,
  type SavedAddress,
  type SignupConsent,
  type UserProfile,
} from './user-profile.model';
import { UserProfileSchema } from './user-profile.schema';

@Service()
export class UserProfileService {
  readonly #firestore = injectFirestore();
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #converter = createValibotConverter(UserProfileSchema);

  async get(uid: string): Promise<UserProfile | null> {
    if (!this.#isBrowser || !uid) return null;
    const snap = await getDoc(this.#ref(uid));
    return snap.exists() ? snap.data() : null;
  }

  /**
   * Live profile for the account panel and `/account`. Emits null when the doc is missing.
   * A read error is passed on, so `rxResource` shows it.
   */
  watch(uid: string): Observable<UserProfile | null> {
    if (!this.#isBrowser || !uid) return of(null);
    return new Observable<UserProfile | null>((subscriber) =>
      onSnapshot(
        this.#ref(uid),
        (snap) => subscriber.next(snap.exists() ? snap.data() : null),
        (error) => subscriber.error(error),
      ),
    );
  }

  /** True when the profile has accepted the current terms version. */
  async hasCurrentTerms(uid: string): Promise<boolean> {
    const profile = await this.get(uid);
    return !!profile && profile.termsVersion === CURRENT_TERMS_VERSION;
  }

  /**
   * First-write signup consent. Uses create-shaped timestamps (`serverTimestamp`).
   * Skips when a profile already exists so returning shoppers keep their choices.
   */
  async writeSignupConsent(uid: string, consent: SignupConsent): Promise<void> {
    if (!this.#isBrowser || !uid || !consent.termsAccepted) return;

    const ref = this.#ref(uid);
    const existing = await getDoc(ref);
    if (existing.exists()) return;

    const now = serverTimestamp();
    // Raw ref: the rules allow exactly these four fields on create.
    await setDoc(doc(this.#firestore, USERS_COLLECTION, uid), {
      termsAcceptedAt: now,
      termsVersion: CURRENT_TERMS_VERSION,
      marketingOptIn: consent.marketingOptIn === true,
      marketingOptInAt: now,
    });
  }

  /** Account → Profile. Blank values are saved as null ("not set"). */
  async saveDetails(uid: string, details: ProfileDetails): Promise<void> {
    await this.#update(uid, {
      name: details.name.trim() || null,
      phone: details.phone.trim() || null,
    });
  }

  /** Account → Delivery Address: replaces the one saved address. */
  async saveAddress(uid: string, address: SavedAddress): Promise<void> {
    const isEgypt = address.country === 'EG';
    await this.#update(uid, {
      address: {
        fullName: address.fullName.trim(),
        line1: address.line1.trim(),
        line2: isEgypt ? null : address.line2?.trim() || null,
        city: address.city.trim(),
        region: isEgypt ? null : address.region?.trim() || null,
        postalCode: isEgypt ? '' : address.postalCode.trim(),
        country: address.country,
        phone: address.phone.trim(),
      },
    });
  }

  /** Account → Emails. `marketingOptInAt` records when the choice was made. */
  async setMarketingOptIn(uid: string, optIn: boolean): Promise<void> {
    await this.#update(uid, { marketingOptIn: optIn, marketingOptInAt: serverTimestamp() });
  }

  /**
   * Owner updates only (see `users/{uid}` in `firestore.rules`): the terms fields never change
   * and every update stamps `updatedAt`. Throws when the doc doesn't exist yet.
   */
  async #update(uid: string, fields: Record<string, unknown>): Promise<void> {
    if (!this.#isBrowser || !uid) throw new Error('Not signed in.');
    await updateDoc(doc(this.#firestore, USERS_COLLECTION, uid), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  }

  #ref(uid: string) {
    return doc(this.#firestore, USERS_COLLECTION, uid).withConverter(this.#converter);
  }
}
