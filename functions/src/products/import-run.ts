import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type UpdateData,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { addCounts, emptyCounts, type ImportCounts } from './product-document.js';

const LOCK_MS = 15 * 60 * 1000;
const CATALOG_PATH = 'settings/catalog';

interface StoredRun {
  readonly runId?: string;
  readonly counts?: Partial<ImportCounts>;
  readonly errors?: number;
  readonly at?: { toMillis?: () => number };
}

export async function claimImportRun(db: Firestore, runId: string, offset: number): Promise<void> {
  const ref = db.doc(CATALOG_PATH);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const run = snap.get('importRun') as StoredRun | undefined;
    const atMs = run?.at?.toMillis?.() ?? 0;
    const fresh = Date.now() - atMs < LOCK_MS;
    if (offset === 0) {
      if (fresh && run?.runId && run.runId !== runId) {
        throw new HttpsError(
          'failed-precondition',
          'An import is already running. Wait a few minutes and try again.',
        );
      }
      tx.set(
        ref,
        { importRun: { runId, at: Timestamp.now(), counts: emptyCounts(), errors: 0 } },
        { merge: true },
      );
      return;
    }
    if (!run || run.runId !== runId) {
      throw new HttpsError('failed-precondition', 'This import session expired. Start the import again.');
    }
    tx.set(
      ref,
      {
        importRun: {
          runId,
          at: Timestamp.now(),
          counts: normalizeCounts(run.counts),
          errors: typeof run.errors === 'number' ? run.errors : 0,
        },
      },
      { merge: true },
    );
  });
}

export async function accumulateImportRun(
  db: Firestore,
  runId: string,
  counts: ImportCounts,
  errors: number,
): Promise<{ counts: ImportCounts; errors: number }> {
  const ref = db.doc(CATALOG_PATH);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const run = snap.get('importRun') as StoredRun | undefined;
    if (!run || run.runId !== runId) {
      throw new HttpsError('failed-precondition', 'This import session expired. Start the import again.');
    }
    const nextCounts = addCounts(normalizeCounts(run.counts), counts);
    const nextErrors = (typeof run.errors === 'number' ? run.errors : 0) + errors;
    tx.set(
      ref,
      { importRun: { runId, at: Timestamp.now(), counts: nextCounts, errors: nextErrors } },
      { merge: true },
    );
    return { counts: nextCounts, errors: nextErrors };
  });
}

export async function markMissingProducts(db: Firestore, runId: string): Promise<number> {
  const snap = await db.collection('products').where('source.system', '==', 'easyorders').limit(500).get();
  let batch = db.batch();
  let pending = 0;
  let missing = 0;

  for (const product of snap.docs) {
    const source = product.get('source') as { lastRunId?: unknown } | undefined;
    if (source?.lastRunId === runId) continue;
    const locked = product.get('lockedFields');
    const update: UpdateData<DocumentData> = {
      'source.missingSince': FieldValue.serverTimestamp(),
    };
    if (!Array.isArray(locked) || !locked.includes('published')) {
      update['published'] = false;
    }
    batch.update(product.ref, update);
    missing += 1;
    pending += 1;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) await batch.commit();
  return missing;
}

function normalizeCounts(value: Partial<ImportCounts> | undefined): ImportCounts {
  const empty = emptyCounts();
  if (!value) return empty;
  return {
    created: numberOrZero(value.created),
    updated: numberOrZero(value.updated),
    unchanged: numberOrZero(value.unchanged),
    skippedLocked: numberOrZero(value.skippedLocked),
    imagesCopied: numberOrZero(value.imagesCopied),
    imagesSkipped: numberOrZero(value.imagesSkipped),
    unpublishedMissing: numberOrZero(value.unpublishedMissing),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
