import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { refreshRates } from './exchange-rates.js';

export const refreshExchangeRates = onSchedule(
  {
    schedule: 'every day 04:00',
    timeZone: 'Africa/Cairo',
    region: 'europe-west3',
    timeoutSeconds: 60,
  },
  async () => {
    try {
      const result = await refreshRates(getFirestore(), { manual: false });
      if (!result.ok) {
        logger.error('Exchange rate refresh kept the last good rates', { error: result.error });
        return;
      }
      logger.info('Exchange rates refreshed', { fetchedAt: result.fetchedAt });
    } catch (error: unknown) {
      logger.error('Exchange rate refresh failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  },
);
