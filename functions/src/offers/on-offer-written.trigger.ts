import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getSearchClient, safeErrorMessage, withRetry } from '../search/algolia-client.js';
import { ALGOLIA_WRITE_KEY, productsIndexName } from '../search/algolia-config.js';
import { computeProductOfferFields, type SearchOfferFields } from '../search/product-record.js';
import { liveOffers, type Offer } from './engine/index.js';
import { clearOfferCache, getActiveOffers } from './offer-cache.js';

export const onOfferWritten = onDocumentWritten(
  {
    document: 'offers/{offerId}',
    region: 'europe-west3',
    secrets: [ALGOLIA_WRITE_KEY],
    retry: false,
  },
  async (event) => {
    const offerId = event.params.offerId;
    const beforeExists = event.data?.before.exists === true;
    const afterExists = event.data?.after.exists === true;
    const afterData = afterExists ? event.data?.after.data() : null;
    const beforeData = beforeExists ? event.data?.before.data() : null;

    const action = !beforeExists
      ? 'offer.create'
      : !afterExists
        ? 'offer.delete'
        : 'offer.update';

    const actorUid =
      action === 'offer.delete'
        ? 'unknown'
        : (typeof afterData?.['updatedBy'] === 'string' && afterData['updatedBy']) ||
          (typeof beforeData?.['updatedBy'] === 'string' && beforeData['updatedBy']) ||
          'admin';

    const db = getFirestore();
    await db.collection('auditLogs').doc().set({
      action,
      offerId,
      actorUid,
      at: FieldValue.serverTimestamp(),
    });

    clearOfferCache();

    try {
      const offers = await getActiveOffers(db, true);
      const now = new Date();
      await recomputeAlgoliaOfferPricing(db, offers, now);
    } catch (error: unknown) {
      logger.error('Failed to recompute Algolia offer pricing after offer write', {
        offerId,
        action,
        message: safeErrorMessage(error),
      });
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
): Promise<number> {
  const indexName = productsIndexName();
  const client = getSearchClient();

  const [prodSnap, existingById] = await Promise.all([
    db.collection('products').where('published', '==', true).limit(500).get(),
    fetchExistingOfferFields(indexName),
  ]);

  const updates: (SearchOfferFields & { readonly objectID: string })[] = [];

  for (const doc of prodSnap.docs) {
    const nextFields = computeProductOfferFields(doc.id, doc.data(), offers, now);
    const prevFields = existingById.get(doc.id);
    if (!prevFields || !offerFieldsEqual(prevFields, nextFields)) {
      updates.push({
        objectID: doc.id,
        ...nextFields,
      });
    }
  }

  if (updates.length > 0) {
    await withRetry(
      () =>
        client.partialUpdateObjects({
          indexName,
          objects: updates,
          createIfNotExists: false,
        }),
      'partialUpdateObjects:offers',
    );
  }

  const liveIds = currentLivePublicOfferIds(offers, now);
  await db.doc('offerState/live').set({
    ids: liveIds,
    at: FieldValue.serverTimestamp(),
  });

  return updates.length;
}

async function fetchExistingOfferFields(
  indexName: string,
): Promise<Map<string, SearchOfferFields>> {
  const client = getSearchClient();
  const map = new Map<string, SearchOfferFields>();

  await withRetry(
    () =>
      client.browseObjects({
        indexName,
        browseParams: {
          attributesToRetrieve: [
            'objectID',
            'listPrice',
            'displayPrice',
            'hasOffer',
            'offerIds',
            'offerBadges',
            'maxDiscountPercent',
          ],
          hitsPerPage: 1000,
        },
        aggregator: (batch) => {
          for (const raw of batch.hits) {
            const hit = raw as Record<string, unknown>;
            if (typeof hit['objectID'] !== 'string') continue;
            map.set(hit['objectID'], {
              listPrice: typeof hit['listPrice'] === 'number' ? hit['listPrice'] : -1,
              displayPrice: typeof hit['displayPrice'] === 'number' ? hit['displayPrice'] : -1,
              hasOffer: hit['hasOffer'] === true,
              offerIds: Array.isArray(hit['offerIds'])
                ? hit['offerIds'].filter((id): id is string => typeof id === 'string')
                : [],
              offerBadges: Array.isArray(hit['offerBadges'])
                ? hit['offerBadges'].filter((b): b is string => typeof b === 'string')
                : [],
              maxDiscountPercent:
                typeof hit['maxDiscountPercent'] === 'number' ? hit['maxDiscountPercent'] : -1,
            });
          }
        },
      }),
    'browseObjects:offers',
  );

  return map;
}

function offerFieldsEqual(left: SearchOfferFields, right: SearchOfferFields): boolean {
  return (
    left.listPrice === right.listPrice &&
    left.displayPrice === right.displayPrice &&
    left.hasOffer === right.hasOffer &&
    left.maxDiscountPercent === right.maxDiscountPercent &&
    JSON.stringify(left.offerIds) === JSON.stringify(right.offerIds) &&
    JSON.stringify(left.offerBadges) === JSON.stringify(right.offerBadges)
  );
}
