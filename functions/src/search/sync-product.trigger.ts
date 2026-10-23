import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getActiveOffers } from '../offers/offer-cache.js';
import { getSearchClient, safeErrorMessage, withRetry } from './algolia-client.js';
import { ALGOLIA_WRITE_KEY, productsIndexName } from './algolia-config.js';
import { getCatalogLookup } from './catalog-cache.js';
import { searchRecordsEqual, toSearchRecord } from './product-record.js';

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

    if (beforeData?.['published'] !== true && afterData?.['published'] !== true) {
      return;
    }

    const db = getFirestore();
    const [{ categoriesById, brandsById }, offers] = await Promise.all([
      getCatalogLookup(db),
      getActiveOffers(db),
    ]);

    const before = toSearchRecord(productId, beforeData, categoriesById, brandsById, offers);
    const after = toSearchRecord(productId, afterData, categoriesById, brandsById, offers);

    if (before === null && after === null) {
      return;
    }
    if (searchRecordsEqual(before, after)) {
      return;
    }

    const op: 'saveObject' | 'deleteObject' = after === null ? 'deleteObject' : 'saveObject';

    try {
      const client = getSearchClient();
      const indexName = productsIndexName();

      if (after === null) {
        await withRetry(
          () => client.deleteObject({ indexName, objectID: productId }),
          'deleteObject',
          productId,
        );
      } else {
        await withRetry(
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
      await db.collection('searchSyncErrors').doc(productId).set({
        op,
        message,
        at: FieldValue.serverTimestamp(),
      });
    }
  },
);
