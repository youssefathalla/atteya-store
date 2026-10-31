import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import {
  CURRENT_TERMS_VERSION,
  USERS_COLLECTION,
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
    await setDoc(ref, {
      termsAcceptedAt: now,
      termsVersion: CURRENT_TERMS_VERSION,
      marketingOptIn: consent.marketingOptIn === true,
      marketingOptInAt: now,
    });
  }

  #ref(uid: string) {
    return doc(this.#firestore, USERS_COLLECTION, uid).withConverter(this.#converter);
  }
}
