import { FieldPath, FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { getSearchClient, safeErrorMessage, withRetry } from '../search/algolia-client.js';
import { ALGOLIA_WRITE_KEY, productsIndexName } from '../search/algolia-config.js';
import { computeProductOfferFields, type SearchOfferFields } from '../search/product-record.js';
import { recordSearchSyncError } from '../search/sync-product.trigger.js';
import { liveOffers, type Offer } from './engine/index.js';
import { clearOfferCache, getActiveOffers } from './offer-cache.js';

export interface RecomputeOfferPricingResult {
  readonly scanned: number;
  readonly updated: number;
}

export const onOfferWritten = onDocumentWrittenWithAuthContext(
  {
    document: 'offers/{offerId}',
    region: 'europe-west3',
    timeoutSeconds: 120,
    secrets: [ALGOLIA_WRITE_KEY],
    retry: false,
  },
  async (event) => {
    const offerId = event.params.offerId;
    const beforeExists = event.data?.before.exists === true;
    const afterExists = event.data?.after.exists === true;
    const afterData = afterExists ? event.data?.after.data() : null;
    const beforeData = beforeExists ? event.data?.before.data() : null;

    const action = !beforeExists ? 'offer.create' : !afterExists ? 'offer.delete' : 'offer.update';

    // A deleted doc has no `updatedBy`, so deletes use the signed-in caller of the write.
    // `authId` is set for user and service-account writes; `system` and unauthenticated writes have none.
    const authUid = typeof event.authId === 'string' && event.authId ? event.authId : null;
    const savedUid =
      (typeof afterData?.['updatedBy'] === 'string' && afterData['updatedBy']) ||
      (typeof beforeData?.['updatedBy'] === 'string' && beforeData['updatedBy']) ||
      null;
    const actorUid = action === 'offer.delete' ? (authUid ?? 'unknown') : (savedUid ?? authUid ?? 'admin');

    const db = getFirestore();
    try {
      await db.collection('auditLogs').doc().set({
        action,
        offerId,
        actorUid,
        at: FieldValue.serverTimestamp(),
      });
    } catch (auditError: unknown) {
      logger.warn('Failed to write offer audit log', {
        offerId,
        action,
        message: safeErrorMessage(auditError),
      });
    }

    clearOfferCache();

    const startedAt = Date.now();
    try {
      let offers = await getActiveOffers(db, true);
      let scanned = 0;
      let updated = 0;
      let passes = 0;

      for (let pass = 1; pass <= 3; pass += 1) {
        passes = pass;
        const fingerprintBefore = fingerprintOffers(offers);
        const result = await recomputeAlgoliaOfferPricing(db, offers, new Date());
        scanned = result.scanned;
        updated = result.updated;

        const latestOffers = await getActiveOffers(db, true);
        if (fingerprintOffers(latestOffers) === fingerprintBefore) {
          break;
        }
        offers = latestOffers;
      }

      try {
        await db.collection('searchSyncErrors').doc('offer-pricing').delete();
      } catch (cleanupError: unknown) {
        logger.warn('Failed to clear searchSyncErrors/offer-pricing record', {
          offerId,
          action,
          message: safeErrorMessage(cleanupError),
        });
      }

      logger.info('offer pricing synced', {
        offerId,
        action,
        scanned,
        updated,
        passes,
        ms: Date.now() - startedAt,
      });
    } catch (error: unknown) {
      const message = safeErrorMessage(error);
      logger.error('Failed to recompute Algolia offer pricing after offer write', {
        offerId,
        action,
        message,
      });
      await recordSearchSyncError(db, 'offer-pricing', action, message);
    }
  },
);

export function currentLivePublicOfferIds(offers: readonly Offer[], now: Date): string[] {
  const publicEveryone = offers.filter(
    (offer) => offer.visibility === 'public' && offer.audience === 'everyone' && !offer.requiresCode,
  );
  return liveOffers(publicEveryone, { now, signedIn: false })
    .map((offer) => offer.id)
    .sort();
}

export async function recomputeAlgoliaOfferPricing(
  db: Firestore,
  offers: readonly Offer[],
  now: Date,
): Promise<RecomputeOfferPricingResult> {
  const indexName = productsIndexName();
  const client = getSearchClient();

  const updates: (SearchOfferFields & { readonly objectID: string })[] = [];
  let scanned = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  for (;;) {
    let pageQuery = db
      .collection('products')
      .where('published', '==', true)
      .orderBy(FieldPath.documentId())
      .limit(500);
    if (lastDoc) {
      pageQuery = pageQuery.startAfter(lastDoc);
    }
    const snap = await pageQuery.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned += 1;
      const nextFields = computeProductOfferFields(doc.id, doc.data(), offers, now);
      updates.push({
        objectID: doc.id,
        ...nextFields,
      });
      lastDoc = doc;
    }

    if (snap.size < 500) break;
  }

  if (updates.length > 0) {
    await withRetry(
      () =>
        client.partialUpdateObjects({
          indexName,
          objects: updates,
          createIfNotExists: false,
          waitForTasks: true,
        }),
      'partialUpdateObjects:offers',
    );
  }

  const liveIds = currentLivePublicOfferIds(offers, now);
  await db.doc('offerState/live').set({
    ids: liveIds,
    at: FieldValue.serverTimestamp(),
  });

  return { scanned, updated: updates.length };
}

function fingerprintOffers(offers: readonly Offer[]): string {
  return offers
    .map((offer) => `${offer.id}:${offer.updatedAtMs ?? 0}`)
    .sort()
    .join(',');
}
