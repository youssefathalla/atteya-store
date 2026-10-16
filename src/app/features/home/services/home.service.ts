import { computed, Service } from '@angular/core';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalDoc } from '@shared/utils/firebase/firestore-signals';
import { HomeSettingsSchema } from '../schemas/home.schema';
import { HomeHero, HomeSettings } from '../models/home.model';
import { DEFAULT_HOME_HERO } from '../data/home.data';

@Service()
export class HomeService {
  readonly #firestore = injectFirestore();

  readonly #homeDocRef = doc(this.#firestore, 'settings', 'home').withConverter(
    createValibotConverter(HomeSettingsSchema),
  );

  readonly #homeDoc = signalDoc(this.#homeDocRef);

  /**
   * Indicates whether the live home settings document is loading.
   */
  readonly isLoading = computed<boolean>(() => this.#homeDoc() === undefined);

  /**
   * Evaluates to live hero configuration from Firestore;
   * Falls back gracefully to DEFAULT_HOME_HERO when unseeded or loading.
   */
  readonly hero = computed<HomeHero>(() => {
    const docData = this.#homeDoc();
    if (docData?.hero) {
      return docData.hero;
    }
    return DEFAULT_HOME_HERO;
  });

  /**
   * Publishes updated hero banner settings to Firestore.
   */
  async updateHero(hero: HomeHero): Promise<void> {
    const payload: HomeSettings = {
      id: 'home',
      hero,
      updatedAt: serverTimestamp(),
    };
    await setDoc(this.#homeDocRef, payload, { merge: true });
  }

  /**
   * Resets hero banner settings to defaults.
   */
  async resetDefaultHero(): Promise<void> {
    await this.updateHero(DEFAULT_HOME_HERO);
  }
}
