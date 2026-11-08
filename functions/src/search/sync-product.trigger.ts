import {
  type DocumentData,
  FieldValue,
  type Firestore,
  getFirestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getActiveOffers } from '../offers/offer-cache.js';
import { getSearchClient, safeErrorMessage, withRetry } from './algolia-client.js';
import { ALGOLIA_WRITE_KEY, productsIndexName } from './algolia-config.js';
import { getCatalogLookup } from './catalog-cache.js';
import { searchRecordsEqual, toSearchRecord } from './product-record.js';

export type ProductSearchSyncDeps = {
  readonly getCatalogLookup: typeof getCatalogLookup;
  readonly getActiveOffers: typeof getActiveOffers;
  readonly getSearchClient: typeof getSearchClient;
  readonly productsIndexName: typeof productsIndexName;
  readonly withRetry: typeof withRetry;
};

const defaultProductSearchSyncDeps: ProductSearchSyncDeps = {
  getCatalogLookup,
  getActiveOffers,
  getSearchClient,
  productsIndexName,
  withRetry,
};

export async function recordSearchSyncError(
  db: Firestore,
  docId: string,
  op: string,
  message: string,
): Promise<void> {
  try {
    await db.collection('searchSyncErrors').doc(docId).set({
      op,
      message,
      at: FieldValue.serverTimestamp(),
    });
  } catch (writeError: unknown) {
    logger.error('Failed to persist searchSyncErrors document', {
      docId,
      op,
      message: safeErrorMessage(writeError),
    });
  }
}

/**
 * Core product → Algolia sync. Exported for unit tests (catalog/offer failures must record searchSyncErrors).
 */
export async function executeProductSearchSync(
  db: Firestore,
  productId: string,
  beforeData: DocumentData | null | undefined,
  afterData: DocumentData | null | undefined,
  deps: ProductSearchSyncDeps = defaultProductSearchSyncDeps,
): Promise<void> {
  if (beforeData?.['published'] !== true && afterData?.['published'] !== true) {
    return;
  }

  let op: 'saveObject' | 'deleteObject' =
    afterData?.['published'] === true ? 'saveObject' : 'deleteObject';

  try {
    const [{ categoriesById, brandsById, playerNamesById }, offers] = await Promise.all([
      deps.getCatalogLookup(db),
      deps.getActiveOffers(db, true),
    ]);

    const now = new Date();
    const lookup = [categoriesById, brandsById, offers, now, playerNamesById] as const;
    const before = toSearchRecord(productId, beforeData, ...lookup);
    const after = toSearchRecord(productId, afterData, ...lookup);

    if (before === null && after === null) {
      return;
    }
    if (searchRecordsEqual(before, after)) {
      return;
    }

    op = after === null ? 'deleteObject' : 'saveObject';

    const client = deps.getSearchClient();
    const indexName = deps.productsIndexName();

    if (after === null) {
      await deps.withRetry(
        () => client.deleteObject({ indexName, objectID: productId }),
        'deleteObject',
        productId,
      );
    } else {
      await deps.withRetry(
        () => client.saveObject({ indexName, body: after }),
        'saveObject',
        productId,
      );
    }

    await db.collection('searchSyncErrors').doc(productId).delete();
  } catch (error: unknown) {
    const message = safeErrorMessage(error);
    logger.error('Algolia product sync failed after retries', {
      productId,
      op,
      message,
    });
    await recordSearchSyncError(db, productId, op, message);
  }
}

export const syncProductSearch = onDocumentWritten(
  {
    document: 'products/{productId}',
    region: 'europe-west3',
    secrets: [ALGOLIA_WRITE_KEY],
    retry: false,
  },
  async (event) => {
    const productId = event.params.productId;
    const beforeData = event.data?.before.exists ? event.data.before.data() : null;
    const afterData = event.data?.after.exists ? event.data.after.data() : null;

    await executeProductSearchSync(getFirestore(), productId, beforeData, afterData);
  },
);
