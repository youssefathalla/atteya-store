import { computed, Service } from '@angular/core';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalDoc } from '@shared/utils/firebase/firestore-signals';
import { NavSettingsSchema } from './nav.schema';
import { NavCategory, NavSettings } from './nav.model';
import { NAV_CATEGORIES } from './nav.data';

@Service()
export class NavService {
  readonly #firestore = injectFirestore();

  readonly #navDocRef = doc(this.#firestore, 'settings', 'navigation').withConverter(
    createValibotConverter(NavSettingsSchema),
  );

  readonly #navDoc = signalDoc(this.#navDocRef);
  /**
   * Indicates whether the live document is currently being fetched.
   */
  readonly isLoading = computed<boolean>(() => this.#navDoc() === undefined);
  /**
   * Evaluates to live categories from Firestore;
   * Seamlessly falls back to bundled NAV_CATEGORIES while loading or if unseeded.
   */
  readonly categories = computed<readonly NavCategory[]>(() => {
    const docData = this.#navDoc();
    if (docData?.categories && docData.categories.length > 0) {
      return docData.categories;
    }
    return NAV_CATEGORIES;
  });

  /**
   * Resets the store navigation document with default categories.
   */
  async resetDefaultNavigation(categories: readonly NavCategory[] = NAV_CATEGORIES): Promise<void> {
    await this.updateNavigation(categories);
  }

  /**
   * @deprecated Use resetDefaultNavigation instead.
   */
  async seedDefaultNavigation(categories: readonly NavCategory[] = NAV_CATEGORIES): Promise<void> {
    await this.resetDefaultNavigation(categories);
  }

  /**
   * Publishes updated navigation categories.
   */
  async updateNavigation(categories: readonly NavCategory[]): Promise<void> {
    const payload: NavSettings = {
      id: 'navigation',
      categories: [...categories],
      version: 1,
      updatedAt: serverTimestamp(),
    };
    await setDoc(this.#navDocRef, payload, { merge: true });
  }
}
