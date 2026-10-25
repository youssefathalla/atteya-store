import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { safeErrorMessage } from '../search/algolia-client.js';
import { ALGOLIA_WRITE_KEY } from '../search/algolia-config.js';
import { getActiveOffers } from './offer-cache.js';
import {
  currentLivePublicOfferIds,
  recomputeAlgoliaOfferPricing,
} from './on-offer-written.trigger.js';

export const refreshOfferPricing = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Africa/Cairo',
    region: 'europe-west3',
    timeoutSeconds: 120,
    secrets: [ALGOLIA_WRITE_KEY],
  },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const [offers, stateSnap] = await Promise.all([
      getActiveOffers(db, true),
      db.doc('offerState/live').get(),
    ]);

    const currentIds = currentLivePublicOfferIds(offers, now);
    const prevData = stateSnap.exists ? stateSnap.data() : undefined;
    const prevIds = Array.isArray(prevData?.['ids'])
      ? prevData['ids'].filter((id): id is string => typeof id === 'string')
      : [];

    if (stateSnap.exists && JSON.stringify(prevIds) === JSON.stringify(currentIds)) {
      return;
    }

    try {
      const { scanned, updated } = await recomputeAlgoliaOfferPricing(db, offers, now);
      logger.info('Refreshed Algolia offer pricing on schedule transition', {
        prevIds,
        currentIds,
        scannedProducts: scanned,
        updatedProducts: updated,
      });
    } catch (error: unknown) {
      logger.error('Failed scheduled Algolia offer pricing refresh', {
        message: safeErrorMessage(error),
      });
    }
  },
);
