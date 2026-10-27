import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { CURRENCY_CODES, parseMarkup } from './currency-config.js';
import {
  queuePublicCurrency,
  readStoredRates,
  readTimestamp,
  refreshRates,
  type RefreshRatesResult,
} from './exchange-rates.js';

export interface SetInternationalPricingResponse {
  readonly markupPercent: number;
}

export const setInternationalPricing = onCall(
  adminCallableOptions(),
  async (request): Promise<SetInternationalPricingResponse> => {
    const actor = await requireRole(request, 'admin');
    const markupPercent = parseMarkup(readMarkupInput(request.data));
    if (markupPercent === null) {
      throw new HttpsError(
        'invalid-argument',
        'Enter a markup from 0 to 200, with at most one decimal place.',
      );
    }

    const db = getFirestore();
    const configRef = db.doc('intlPricing/config');
    const ratesSnap = await db.doc('intlPricing/rates').get();
    const configSnap = await configRef.get();
    const before = parseMarkup(configSnap.data()?.['markupPercent']);
    const storedRates = readStoredRates(ratesSnap.data());
    const ratesUpdatedAt =
      readTimestamp(ratesSnap.data()?.['providerUpdatedAt']) ??
      readTimestamp(ratesSnap.data()?.['fetchedAt']) ??
      Timestamp.now();
    const now = Timestamp.now();
    const batch = db.batch();
    batch.set(
      configRef,
      {
        markupPercent,
        currencies: [...CURRENCY_CODES],
        updatedAt: now,
        updatedBy: actor.uid,
      },
      { merge: true },
    );
    if (storedRates) {
      queuePublicCurrency(batch, db, markupPercent, storedRates, ratesUpdatedAt, now);
    }
    batch.set(db.collection('auditLogs').doc(), {
      action: 'intlPricing.update',
      actorUid: actor.uid,
      at: now,
      before: before === null ? null : { markupPercent: before },
      after: { markupPercent },
    });
    await batch.commit();
    return { markupPercent };
  },
);

export const refreshExchangeRatesNow = onCall(
  adminCallableOptions({ timeoutSeconds: 60 }),
  async (request): Promise<RefreshRatesResult> => {
    await requireRole(request, 'admin');
    return refreshRates(getFirestore(), { manual: true });
  },
);

function readMarkupInput(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>)['markupPercent'];
}
