import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { OfferLimits } from '../offers/engine/index.js';

/** A Free gift offer an order gives gifts from, with its limits. */
export interface UsedGiftOffer {
  readonly offerId: string;
  readonly limits: OfferLimits;
}

/**
 * True when one more use fits. `totalUses` and `perCustomer` count orders, so an order with
 * several gifts (or several pieces) from one offer counts once.
 */
export function offerUseFits(limits: OfferLimits, totalCount: number, customerCount: number): boolean {
  if (limits.totalUses !== null && totalCount >= limits.totalUses) return false;
  if (limits.perCustomer !== null && customerCount >= limits.perCustomer) return false;
  return true;
}

/**
 * Reads the use counts of each gift offer inside `tx` and refuses the order when one is full.
 * Returns a function that adds this order's use (call it after every other read in `tx`).
 * Counts live in `offerUsage/{offerId}` and `offerUsage/{offerId}_{uid}` (Admin SDK only).
 */
export async function readGiftOfferUses(
  tx: Transaction,
  db: Firestore,
  uid: string,
  offers: readonly UsedGiftOffer[],
): Promise<() => void> {
  const refs = offers.map((offer) => ({
    offer,
    total: db.collection('offerUsage').doc(offer.offerId),
    customer: db.collection('offerUsage').doc(`${offer.offerId}_${uid}`),
  }));
  const snaps = await Promise.all(
    refs.map(async (entry) => ({
      ...entry,
      totalCount: readCount((await tx.get(entry.total)).data()?.['count']),
      customerCount: readCount((await tx.get(entry.customer)).data()?.['count']),
    })),
  );
  for (const entry of snaps) {
    if (!offerUseFits(entry.offer.limits, entry.totalCount, entry.customerCount)) {
      throw new HttpsError(
        'failed-precondition',
        'A free gift offer in your bag has run out. Remove the item and add it again to order it without the gift.',
      );
    }
  }
  return () => {
    const now = FieldValue.serverTimestamp();
    for (const entry of snaps) {
      tx.set(entry.total, { offerId: entry.offer.offerId, count: entry.totalCount + 1, updatedAt: now }, { merge: true });
      tx.set(
        entry.customer,
        { offerId: entry.offer.offerId, uid, count: entry.customerCount + 1, updatedAt: now },
        { merge: true },
      );
    }
  };
}

/** Best-effort undo of `readGiftOfferUses` when the order could not be saved (Paymob start failed). */
export async function releaseGiftOfferUses(
  db: Firestore,
  uid: string,
  offers: readonly UsedGiftOffer[],
): Promise<void> {
  if (offers.length === 0) return;
  await db.runTransaction(async (tx) => {
    const refs = offers.flatMap((offer) => [
      db.collection('offerUsage').doc(offer.offerId),
      db.collection('offerUsage').doc(`${offer.offerId}_${uid}`),
    ]);
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const now = FieldValue.serverTimestamp();
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      tx.set(refs[index]!, { count: Math.max(0, readCount(snap.data()?.['count']) - 1), updatedAt: now }, { merge: true });
    });
  });
}

function readCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}
