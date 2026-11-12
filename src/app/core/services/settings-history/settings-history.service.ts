import { Service } from '@angular/core';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import {
  SETTINGS_VERSIONS_LIMIT,
  settingsVersionFrom,
  type SettingsHistoryDocId,
  type SettingsVersion,
} from './settings-history.model';

/** Reads the Previous Versions of `settings/navigation` and `settings/home` (ATS-251). */
@Service()
export class SettingsHistoryService {
  readonly #db = injectFirestore();

  /** Newest first, at most 30; a version whose envelope is broken is left out. */
  async list(docId: SettingsHistoryDocId): Promise<SettingsVersion[]> {
    const snap = await getDocs(
      query(
        collection(this.#db, 'settingsHistory', docId, 'versions'),
        orderBy('replacedAt', 'desc'),
        limit(SETTINGS_VERSIONS_LIMIT),
      ),
    );
    return snap.docs
      .map((doc) => settingsVersionFrom(doc.id, doc.data()))
      .filter((version): version is SettingsVersion => version !== null);
  }
}
