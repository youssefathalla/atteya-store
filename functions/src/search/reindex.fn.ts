import type { IndexSettings, SearchClient } from 'algoliasearch';
import { FieldPath, FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { getActiveOffers } from '../offers/offer-cache.js';
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
    const [{ categoriesById, brandsById, playerNamesById }, offers] = await Promise.all([
      getCatalogLookup(db, true),
      getActiveOffers(db, true),
    ]);

    const now = new Date();
    const records: ProductSearchRecord[] = [];
    const publishedIds = new Set<string>();

    let lastId: string | undefined;
    for (;;) {
      let pageQuery = db
        .collection('products')
        .where('published', '==', true)
        .orderBy(FieldPath.documentId())
        .limit(500);
      if (lastId) {
        pageQuery = pageQuery.startAfter(lastId);
      }
      const snap = await pageQuery.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const record = toSearchRecord(
          doc.id,
          doc.data(),
          categoriesById,
          brandsById,
          offers,
          now,
          playerNamesById,
        );
        if (record) {
          records.push(record);
          publishedIds.add(record.objectID);
        }
        lastId = doc.id;
      }

      if (snap.size < 500) break;
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

      const desiredPrimary = primaryIndexSettings(indexName);
      const desiredAsc = replicaIndexSettings('asc');
      const desiredDesc = replicaIndexSettings('desc');

      const [currentPrimary, currentAsc, currentDesc] = await Promise.all([
        readCurrentSettings(client, indexName, 'getSettings:primary'),
        readCurrentSettings(client, replicas.priceAsc, 'getSettings:priceAsc'),
        readCurrentSettings(client, replicas.priceDesc, 'getSettings:priceDesc'),
      ]);

      if (settingsNeedUpdate(desiredPrimary, currentPrimary)) {
        await applyIndexSettings(
          client,
          {
            indexName,
            indexSettings: desiredPrimary,
            forwardToReplicas: true,
            waitForTasks: true,
          },
          'setSettings:primary',
        );
      }

      if (settingsNeedUpdate(desiredAsc, currentAsc)) {
        await applyIndexSettings(
          client,
          {
            indexName: replicas.priceAsc,
            indexSettings: desiredAsc,
            waitForTasks: true,
          },
          'setSettings:priceAsc',
        );
      }

      if (settingsNeedUpdate(desiredDesc, currentDesc)) {
        await applyIndexSettings(
          client,
          {
            indexName: replicas.priceDesc,
            indexSettings: desiredDesc,
            waitForTasks: true,
          },
          'setSettings:priceDesc',
        );
      }

      if (records.length > 0) {
        await withRetry(
          () => client.saveObjects({ indexName, objects: records, waitForTasks: true }),
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
          () => client.deleteObjects({ indexName, objectIDs: strayIds, waitForTasks: true }),
          'deleteObjects',
        );
      }

      await clearSearchSyncErrors(db);

      await db
        .collection('auditLogs')
        .doc()
        .set({
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
      throw new HttpsError('internal', `Couldn't rebuild the search index: ${safeErrorMessage(error)}`);
    }
  },
);

function parseDryRun(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return true;
  return (raw as Record<string, unknown>)['dryRun'] !== false;
}

function settingsNeedUpdate(desired: IndexSettings, current: IndexSettings | null): boolean {
  if (!current) return true;
  const currentRecord = current as Record<string, unknown>;
  for (const [key, value] of Object.entries(desired)) {
    if (!(key in currentRecord) || currentRecord[key] === undefined) {
      return true;
    }
    if (JSON.stringify(currentRecord[key]) !== JSON.stringify(value)) {
      return true;
    }
  }
  return false;
}

async function readCurrentSettings(
  client: SearchClient,
  indexName: string,
  label: string,
): Promise<IndexSettings | null> {
  try {
    return await withRetry(() => client.getSettings({ indexName }), label);
  } catch (error: unknown) {
    const status =
      typeof error === 'object' && error !== null
        ? ((error as { status?: unknown; statusCode?: unknown }).status ??
          (error as { statusCode?: unknown }).statusCode)
        : undefined;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

async function applyIndexSettings(
  client: SearchClient,
  options: {
    readonly indexName: string;
    readonly indexSettings: IndexSettings;
    readonly forwardToReplicas?: boolean;
    readonly waitForTasks: true;
  },
  label: string,
): Promise<void> {
  await withRetry(async () => {
    const response = await client.setSettings({
      indexName: options.indexName,
      indexSettings: options.indexSettings,
      ...(options.forwardToReplicas !== undefined ? { forwardToReplicas: options.forwardToReplicas } : {}),
    });
    if (options.waitForTasks) {
      await client.waitForTask({ indexName: options.indexName, taskID: response.taskID });
    }
  }, label);
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
