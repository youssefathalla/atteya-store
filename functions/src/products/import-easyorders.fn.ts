import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { writeCatalogSummary } from './catalog-summary.js';
import { EasyOrdersError, fetchEasyOrdersProductIds } from './easyorders.client.js';
import { createRunId, parseImportRequest, type ImportResponse } from './import-request.js';
import {
  accumulateImportRun,
  claimImportRun,
  markMissingProducts,
  releaseImportRun,
} from './import-run.js';
import { importSlice } from './import-slice.js';
import type { ImportCounts } from './product-document.js';

const MISSING_NOTE =
  'Some products could not be read, so nothing was hidden for being missing.';

export const importEasyOrdersProducts = onCall(
  adminCallableOptions({ timeoutSeconds: 540, memory: '512MiB' }),
  async (request): Promise<ImportResponse> => {
    const actor = await requireRole(request, 'admin');
    const input = parseImportRequest(request.data);
    const runId = input.runId ?? createRunId();
    const db = getFirestore();

    if (!input.dryRun) await claimImportRun(db, runId, input.offset);

    const ids = await loadIds();
    const slice = ids.slice(input.offset, input.offset + input.batchSize);
    const nextOffset = input.offset + slice.length < ids.length ? input.offset + slice.length : null;
    const batch = await importSlice(db, { dryRun: input.dryRun, runId, ids: slice });

    let counts: ImportCounts = batch.counts;
    let errorCount = batch.errors.length;
    if (!input.dryRun) {
      const accumulated = await accumulateImportRun(db, runId, batch.counts, batch.errors.length);
      counts = accumulated.counts;
      errorCount = accumulated.errors;
      if (nextOffset === null) {
        const unpublishedMissing = errorCount === 0 ? await markMissingProducts(db, runId) : 0;
        counts = { ...counts, unpublishedMissing };
        try {
          await writeCatalogSummary(db);
        } finally {
          await releaseImportRun(db);
        }
        await db.collection('auditLogs').doc().set({
          action: 'products.import',
          actorUid: actor.uid,
          actorEmail: actor.email ?? actor.uid,
          at: FieldValue.serverTimestamp(),
          runId,
          counts,
          errors: errorCount,
        });
      }
    }

    const errors = [...batch.errors];
    if (!input.dryRun && nextOffset === null && errorCount > 0) errors.push(MISSING_NOTE);

    return {
      runId,
      dryRun: input.dryRun,
      total: ids.length,
      processed: slice.length,
      nextOffset,
      counts,
      rows: batch.rows,
      errors,
    };
  },
);

async function loadIds(): Promise<readonly string[]> {
  try {
    return await fetchEasyOrdersProductIds();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof EasyOrdersError) throw new HttpsError('unavailable', error.message);
    throw new HttpsError('unavailable', 'Could not reach EasyOrders. Please try again.');
  }
}
