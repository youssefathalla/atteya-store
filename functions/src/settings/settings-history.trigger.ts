import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  isSettingsHistoryDoc,
  MAX_SETTINGS_VERSIONS,
  savedByUid,
  SETTINGS_HISTORY_COLLECTION,
  SETTINGS_VERSIONS_SUBCOLLECTION,
  settingsSummary,
  versionsToPrune,
} from './settings-history.js';

async function emailOf(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  try {
    return (await getAuth().getUser(uid)).email ?? null;
  } catch {
    return null;
  }
}

/**
 * Keeps the version each save of `settings/navigation` or `settings/home` replaced
 * (ATS-251), so staff can bring an earlier one back from Previous Versions. The version id is
 * the event id, so a repeated delivery of the same event writes the same doc once. Only the
 * newest 30 per doc are kept; older ones are deleted in the same run.
 */
export const onSettingsHistoryWrite = onDocumentWritten(
  { document: 'settings/{docId}', region: 'europe-west3' },
  async (event) => {
    const docId = event.params.docId;
    if (!isSettingsHistoryDoc(docId)) return;
    const before = event.data?.before.data();
    if (!before) return;

    const db = getFirestore();
    const versions = db
      .collection(SETTINGS_HISTORY_COLLECTION)
      .doc(docId)
      .collection(SETTINGS_VERSIONS_SUBCOLLECTION);

    const replacedAt = Timestamp.fromDate(new Date(event.time));
    const updatedAt = before['updatedAt'];
    const savedAt = updatedAt instanceof Timestamp ? updatedAt : replacedAt;
    const savedBy = savedByUid(before);

    await versions.doc(event.id).set({
      data: before,
      savedAt,
      replacedAt,
      savedBy,
      savedByEmail: await emailOf(savedBy),
      summary: settingsSummary(docId, before),
    });

    const snap = await versions
      .orderBy('replacedAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .select()
      .get();
    const stale = versionsToPrune(
      snap.docs.map((doc) => doc.id),
      MAX_SETTINGS_VERSIONS,
    );
    if (stale.length === 0) return;
    const batch = db.batch();
    for (const id of stale) batch.delete(versions.doc(id));
    await batch.commit();
    logger.info('Old settings versions removed', { docId, removed: stale.length });
  },
);
