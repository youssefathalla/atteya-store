import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { getSearchClient, safeErrorMessage, withRetry } from './algolia-client.js';
import { ALGOLIA_WRITE_KEY, productsIndexName, replicaNames } from './algolia-config.js';
import { primaryIndexSettings, replicaIndexSettings } from './algolia-settings.js';
import { getCatalogLookup } from './catalog-cache.js';
import { toSearchRecord, type ProductSearchRecord } from './product-record.js';

export interface ReindexSearchResponse {
  readonly dryRun: boolean;
  readonly indexName: string;
  readonly indexed: number;
  readonly deleted: number;
  readonly sample: readonly ProductSearchRecord[];
}

export const reindexSearch = onCall(
  adminCallableOptions({ timeoutSeconds: 300, secrets: [ALGOLIA_WRITE_KEY] }),
  async (request): Promise<ReindexSearchResponse> => {
    const actor = await requireRole(request, 'admin');
    const dryRun = parseDryRun(request.data);

    const db = getFirestore();
    const indexName = productsIndexName();
    const { categoriesById, brandsById } = await getCatalogLookup(db, true);

    const snap = await db
      .collection('products')
      .where('published', '==', true)
      .limit(500)
      .get();

    const records: ProductSearchRecord[] = [];
    const publishedIds = new Set<string>();

    for (const doc of snap.docs) {
      const record = toSearchRecord(doc.id, doc.data(), categoriesById, brandsById);
      if (record) {
        records.push(record);
        publishedIds.add(record.objectID);
      }
    }

    if (dryRun) {
      return {
        dryRun: true,
        indexName,
        indexed: records.length,
        deleted: 0,
        sample: records.slice(0, 3),
      };
    }

    try {
      const client = getSearchClient();
      const replicas = replicaNames(indexName);

      await withRetry(
        () =>
          client.setSettings({
            indexName,
            indexSettings: primaryIndexSettings(indexName),
            forwardToReplicas: true,
          }),
        'setSettings:primary',
      );

      await withRetry(
        () =>
          client.setSettings({
            indexName: replicas.priceAsc,
            indexSettings: replicaIndexSettings('asc'),
          }),
        'setSettings:priceAsc',
      );

      await withRetry(
        () =>
          client.setSettings({
            indexName: replicas.priceDesc,
            indexSettings: replicaIndexSettings('desc'),
          }),
        'setSettings:priceDesc',
      );

      if (records.length > 0) {
        await withRetry(
          () => client.saveObjects({ indexName, objects: records }),
          'saveObjects',
        );
      }

      const existingIds: string[] = [];
      await withRetry(
        () =>
          client.browseObjects({
            indexName,
            browseParams: { attributesToRetrieve: ['objectID'], hitsPerPage: 1000 },
            aggregator: (batch) => {
              for (const hit of batch.hits) {
                if (typeof hit.objectID === 'string') {
                  existingIds.push(hit.objectID);
                }
              }
            },
          }),
        'browseObjects',
      );

      const strayIds = Array.from(new Set(existingIds)).filter((id) => !publishedIds.has(id));
      if (strayIds.length > 0) {
        await withRetry(
          () => client.deleteObjects({ indexName, objectIDs: strayIds }),
          'deleteObjects',
        );
      }

      await clearSearchSyncErrors(db);

      await db.collection('auditLogs').doc().set({
        action: 'search.reindex',
        actorUid: actor.uid,
        actorEmail: actor.email ?? actor.uid,
        indexName,
        counts: { indexed: records.length, deleted: strayIds.length },
        at: FieldValue.serverTimestamp(),
      });

      return {
        dryRun: false,
        indexName,
        indexed: records.length,
        deleted: strayIds.length,
        sample: records.slice(0, 3),
      };
    } catch (error: unknown) {
      throw new HttpsError(
        'internal',
        `Couldn't rebuild the search index: ${safeErrorMessage(error)}`,
      );
    }
  },
);

function parseDryRun(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return true;
  return (raw as Record<string, unknown>)['dryRun'] !== false;
}

async function clearSearchSyncErrors(db: Firestore): Promise<void> {
  const errSnap = await db.collection('searchSyncErrors').limit(500).get();
  if (errSnap.empty) return;
  const batch = db.batch();
  for (const doc of errSnap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
