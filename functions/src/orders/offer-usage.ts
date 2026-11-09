import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { OfferLimits } from '../offers/engine/index.js';

/**
 * An offer an order uses, with its limits: a Free gift offer it gives gifts from (`gift`), or a
 * Buy X Get Y offer that discounts it (`deal`).
 */
export interface UsedOffer {
  readonly offerId: string;
  /** The offer's title as shoppers see it ("Buy 2, get 1 free"); used in the refusal message. */
  readonly title: string;
  readonly limits: OfferLimits;
  readonly kind: 'gift' | 'deal';
}

/**
 * `updatedBy` on an offer an order switched off at its last use, so a failed Paymob start can
 * switch only those back on (never one staff switched off themselves).
 */
export const OFFER_LIMIT_ACTOR = 'system:offer-limit';

const GIFT_OFFER_FULL =
  'A free gift offer in your bag has run out. Remove the item and add it again to order it without the gift.';

/**
 * True when one more use fits. `totalUses` and `perCustomer` count orders, so an order with
 * several gifts (or several pieces) from one offer counts once.
 */
export function offerUseFits(limits: OfferLimits, totalCount: number, customerCount: number): boolean {
  if (limits.totalUses !== null && totalCount >= limits.totalUses) return false;
  if (limits.perCustomer !== null && customerCount >= limits.perCustomer) return false;
  return true;
}

/** True when this order's use is the last one `totalUses` allows (the offer then switches off). */
export function isLastOfferUse(limits: OfferLimits, totalCount: number): boolean {
  return limits.totalUses !== null && totalCount + 1 >= limits.totalUses;
}

/**
 * Why an order can't use an offer: `ended` when every use of the offer is gone, `used` when only
 * this shopper's `perCustomer` uses are.
 */
export type OfferFullReason = 'ended' | 'used';

export function offerFullReason(
  limits: OfferLimits,
  totalCount: number,
  customerCount: number,
): OfferFullReason | null {
  if (limits.totalUses !== null && totalCount >= limits.totalUses) return 'ended';
  if (limits.perCustomer !== null && customerCount >= limits.perCustomer) return 'used';
  return null;
}

/**
 * The refusal for an order whose offer is full. A Buy X Get Y offer names itself and puts its id in
 * `details.endedOfferId`, so checkout can leave it out of its own pricing and show the new total;
 * the order is never charged more than the shopper saw.
 */
export function offerFullError(offer: UsedOffer, reason: OfferFullReason): HttpsError {
  if (offer.kind === 'gift') return new HttpsError('failed-precondition', GIFT_OFFER_FULL);
  const title = offer.title.trim();
  const message =
    reason === 'used'
      ? title
        ? `You've already used the ${title} offer, so this order's total changed. Check your bag and place your order again.`
        : "You've already used an offer in your bag, so this order's total changed. Check your bag and place your order again."
      : title
        ? `The ${title} offer has ended, so this order's total changed. Check your bag and place your order again.`
        : "An offer in your bag has ended, so this order's total changed. Check your bag and place your order again.";
  return new HttpsError('failed-precondition', message, { endedOfferId: offer.offerId });
}

/**
 * The ids from checkout's `endedOfferIds` that really have no use left for `uid` (read outside a
 * transaction). Only those may be left out of the order's pricing: with two Buy X Get Y offers on
 * the same items, dropping one that still has uses could let a bigger, lower-priority discount win,
 * so an id the server can't confirm is ignored. Ids that aren't among `offers` change nothing.
 */
export async function confirmedEndedOfferIds(
  db: Firestore,
  uid: string,
  offers: readonly { readonly id: string; readonly limits: OfferLimits }[],
  requested: readonly string[],
): Promise<Set<string>> {
  const wanted = new Set(requested);
  const limited = offers.filter(
    (offer) =>
      wanted.has(offer.id) && (offer.limits.totalUses !== null || offer.limits.perCustomer !== null),
  );
  const confirmed = new Set<string>();
  if (limited.length === 0) return confirmed;
  const snaps = await db.getAll(
    ...limited.flatMap((offer) => [
      db.collection('offerUsage').doc(offer.id),
      db.collection('offerUsage').doc(`${offer.id}_${uid}`),
    ]),
  );
  limited.forEach((offer, index) => {
    const totalCount = readCount(snaps[index * 2]?.data()?.['count']);
    const customerCount = readCount(snaps[index * 2 + 1]?.data()?.['count']);
    if (offerFullReason(offer.limits, totalCount, customerCount) !== null) confirmed.add(offer.id);
  });
  return confirmed;
}

/**
 * Reads the use counts of each offer inside `tx` and refuses the order when one is full
 * (`offerFullError`). Returns a function that adds this order's use (call it after every other
 * read in `tx`); when that use is the last one `totalUses` allows, it also switches the offer off
 * (`active: false`) in the same transaction, so the live offers listener takes it out of every
 * bag, product page and checkout. The function returns the ids it switched off.
 * Counts live in `offerUsage/{offerId}` and `offerUsage/{offerId}_{uid}` (Admin SDK only).
 */
export async function readOfferUses(
  tx: Transaction,
  db: Firestore,
  uid: string,
  offers: readonly UsedOffer[],
): Promise<() => readonly string[]> {
  const refs = offers.map((offer) => ({
    offer,
    total: db.collection('offerUsage').doc(offer.offerId),
    customer: db.collection('offerUsage').doc(`${offer.offerId}_${uid}`),
    offerDoc: db.collection('offers').doc(offer.offerId),
  }));
  const snaps = await Promise.all(
    refs.map(async (entry) => {
      const [totalSnap, customerSnap] = await Promise.all([tx.get(entry.total), tx.get(entry.customer)]);
      return {
        ...entry,
        totalCount: readCount(totalSnap.data()?.['count']),
        customerCount: readCount(customerSnap.data()?.['count']),
      };
    }),
  );
  for (const entry of snaps) {
    const reason = offerFullReason(entry.offer.limits, entry.totalCount, entry.customerCount);
    if (reason) throw offerFullError(entry.offer, reason);
  }
  // Only the offers this order uses up need their doc. One is switched off below only while it is
  // still on: an offer staff already paused (this server's offer cache can be behind) is left as it
  // is, so it never gets the marker and a failed Paymob start can't switch it back on.
  const ending = await Promise.all(
    snaps
      .filter((entry) => isLastOfferUse(entry.offer.limits, entry.totalCount))
      .map(async (entry) => {
        const snap = await tx.get(entry.offerDoc);
        return { entry, live: snap.exists && snap.data()?.['active'] === true };
      }),
  );
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
    const ended: string[] = [];
    for (const { entry, live } of ending) {
      if (!live) continue;
      tx.update(entry.offerDoc, { active: false, updatedAt: now, updatedBy: OFFER_LIMIT_ACTOR });
      ended.push(entry.offer.offerId);
    }
    return ended;
  };
}

/**
 * Best-effort undo of `readOfferUses` when the order could not be saved (Paymob start failed):
 * gives the uses back and switches back on the offers this order switched off (`endedOfferIds`),
 * unless staff changed the offer since.
 */
export async function releaseOfferUses(
  db: Firestore,
  uid: string,
  offers: readonly UsedOffer[],
  endedOfferIds: readonly string[] = [],
): Promise<void> {
  if (offers.length === 0) return;
  await db.runTransaction(async (tx) => {
    const refs = offers.flatMap((offer) => [
      db.collection('offerUsage').doc(offer.offerId),
      db.collection('offerUsage').doc(`${offer.offerId}_${uid}`),
    ]);
    const offerRefs = endedOfferIds.map((id) => db.collection('offers').doc(id));
    const [snaps, offerSnaps] = await Promise.all([
      Promise.all(refs.map((ref) => tx.get(ref))),
      Promise.all(offerRefs.map((ref) => tx.get(ref))),
    ]);
    const now = FieldValue.serverTimestamp();
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      tx.set(refs[index]!, { count: Math.max(0, readCount(snap.data()?.['count']) - 1), updatedAt: now }, { merge: true });
    });
    offerSnaps.forEach((snap, index) => {
      const data = snap.data();
      if (!snap.exists || data?.['active'] !== false || data?.['updatedBy'] !== OFFER_LIMIT_ACTOR) return;
      tx.update(offerRefs[index]!, { active: true, updatedAt: now });
    });
  });
}

function readCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}
