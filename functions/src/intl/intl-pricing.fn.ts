import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { parseMarkup } from './currency-config.js';
import {
  setPublicCurrency,
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
    const ratesRef = db.doc('intlPricing/rates');
    // One transaction for the reads and the writes, so a rate refresh at the same moment can
    // never leave settings/currency built from mixed inputs.
    await db.runTransaction(async (tx) => {
      const [ratesSnap, configSnap] = await tx.getAll(ratesRef, configRef);
      const before = parseMarkup(configSnap.data()?.['markupPercent']);
      const storedRates = readStoredRates(ratesSnap.data());
      const ratesUpdatedAt =
        readTimestamp(ratesSnap.data()?.['providerUpdatedAt']) ??
        readTimestamp(ratesSnap.data()?.['fetchedAt']) ??
        Timestamp.now();
      const now = Timestamp.now();
      tx.set(
        configRef,
        {
          markupPercent,
          currencies: FieldValue.delete(),
          updatedAt: now,
          updatedBy: actor.uid,
        },
        { merge: true },
      );
      if (storedRates) {
        setPublicCurrency(tx, db, markupPercent, storedRates, ratesUpdatedAt, now);
      }
      tx.set(db.collection('auditLogs').doc(), {
        action: 'intlPricing.update',
        actorUid: actor.uid,
        at: now,
        before: before === null ? null : { markupPercent: before },
        after: { markupPercent },
      });
    });
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
