import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { OfferLimits } from '../offers/engine/index.js';

/**
 * An offer an order uses, with its limits: a Free gift offer it gives gifts from (`gift`), a
 * Buy X Get Y offer that discounts it (`deal`), a Bundle price or Bundle & Save offer that prices
 * some of its pieces (`bundle`), a Percent off, Amount off or Set price offer that
 * lowers the price of at least one piece (`item`), or a Free shipping offer that made the
 * shipping free (`shipping`). Each counts once per order, however many pieces it touches.
 */
export interface UsedOffer {
  readonly offerId: string;
  /** The offer's title as shoppers see it ("Buy 2, get 1 free"); used in the refusal message. */
  readonly title: string;
  readonly limits: OfferLimits;
  readonly kind: UsedOfferKind;
}

export type UsedOfferKind = 'gift' | 'deal' | 'bundle' | 'item' | 'shipping';

/**
 * The key a guest's `perCustomer` offer uses are counted under, in place of a uid:
 * `guest_<sha256 of the lower-cased, trimmed email>`, so `offerUsage/{offerId}_guest_<hash>`.
 * The same email gives the same key on every guest order.
 */
export function guestOfferCustomerKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `guest_${createHash('sha256').update(normalized).digest('hex')}`;
}

/**
 * The ids one shopper's `perCustomer` offer uses are counted under. A string is one id; a list is
 * the same person under several ids, and the highest count among them is the one checked. Orders
 * pass one id today: the uid when signed in, `guestOfferCustomerKey(email)` for a guest (guests
 * never get `perCustomer` offers, see `liveOffers`, so their key only counts toward nothing).
 */
export type OfferCustomerKeys = string | readonly string[];

function customerKeyList(keys: OfferCustomerKeys): readonly string[] {
  const list = typeof keys === 'string' ? [keys] : keys;
  return [...new Set(list.filter((key) => key.length > 0))];
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
 * The refusal for an order whose offer is full. Every offer type except Free gift names itself and
 * puts its id in `details.endedOfferId` (plus `reason: 'used'` when this shopper used it up), so
 * checkout can leave it out of its own pricing and show the new total; the order is never charged
 * more than the shopper saw. A full Free gift offer asks the shopper to add the item again, since
 * its gifts are saved on the bag line.
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
  // `reason: 'used'` lets checkout say "You've already used the … offer" in the bag's note too.
  const details =
    reason === 'used' ? { endedOfferId: offer.offerId, reason } : { endedOfferId: offer.offerId };
  return new HttpsError('failed-precondition', message, details);
}

/**
 * The ids from checkout's `endedOfferIds` that really have no use left for this shopper (read outside a
 * transaction). Any offer type counts. Only those may be left out of the order's pricing: with two
 * Buy X Get Y offers on the same items, dropping one that still has uses could let a bigger,
 * lower-priority discount win, so an id the server can't confirm is ignored. Ids that aren't among
 * `offers` change nothing.
 */
export async function confirmedEndedOfferIds(
  db: Firestore,
  keys: OfferCustomerKeys,
  offers: readonly { readonly id: string; readonly limits: OfferLimits }[],
  requested: readonly string[],
): Promise<Set<string>> {
  const customerKeys = customerKeyList(keys);
  const perOffer = 1 + customerKeys.length;
  const wanted = new Set(requested);
  const limited = offers.filter(
    (offer) => wanted.has(offer.id) && (offer.limits.totalUses !== null || offer.limits.perCustomer !== null),
  );
  const confirmed = new Set<string>();
  if (limited.length === 0) return confirmed;
  const snaps = await db.getAll(
    ...limited.flatMap((offer) => [
      db.collection('offerUsage').doc(offer.id),
      ...customerKeys.map((key) => db.collection('offerUsage').doc(`${offer.id}_${key}`)),
    ]),
  );
  limited.forEach((offer, index) => {
    const base = index * perOffer;
    const totalCount = readCount(snaps[base]?.data()?.['count']);
    const customerCount = Math.max(
      0,
      ...customerKeys.map((_, k) => readCount(snaps[base + 1 + k]?.data()?.['count'])),
    );
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
 * Counts live in `offerUsage/{offerId}` and `offerUsage/{offerId}_{key}` (Admin SDK only), one
 * doc per customer key: the uid when signed in, `guestOfferCustomerKey(email)` for a guest. With
 * several keys the highest count is checked and this order's use is added to every key.
 */
export async function readOfferUses(
  tx: Transaction,
  db: Firestore,
  keys: OfferCustomerKeys,
  offers: readonly UsedOffer[],
): Promise<() => readonly string[]> {
  const customerKeys = customerKeyList(keys);
  const refs = offers.map((offer) => ({
    offer,
    total: db.collection('offerUsage').doc(offer.offerId),
    customers: customerKeys.map((key) => ({
      key,
      ref: db.collection('offerUsage').doc(`${offer.offerId}_${key}`),
    })),
    offerDoc: db.collection('offers').doc(offer.offerId),
  }));
  const snaps = await Promise.all(
    refs.map(async (entry) => {
      const [totalSnap, ...customerSnaps] = await Promise.all([
        tx.get(entry.total),
        ...entry.customers.map((customer) => tx.get(customer.ref)),
      ]);
      const customerCounts = customerSnaps.map((snap) => readCount(snap.data()?.['count']));
      return {
        ...entry,
        totalCount: readCount(totalSnap?.data()?.['count']),
        customerCounts,
        customerCount: Math.max(0, ...customerCounts),
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
      tx.set(
        entry.total,
        { offerId: entry.offer.offerId, count: entry.totalCount + 1, updatedAt: now },
        { merge: true },
      );
      entry.customers.forEach((customer, k) => {
        tx.set(
          customer.ref,
          {
            offerId: entry.offer.offerId,
            uid: customer.key,
            count: (entry.customerCounts[k] ?? 0) + 1,
            updatedAt: now,
          },
          { merge: true },
        );
      });
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
  keys: OfferCustomerKeys,
  offers: readonly UsedOffer[],
  endedOfferIds: readonly string[] = [],
): Promise<void> {
  if (offers.length === 0) return;
  const customerKeys = customerKeyList(keys);
  await db.runTransaction(async (tx) => {
    const refs = offers.flatMap((offer) => [
      db.collection('offerUsage').doc(offer.offerId),
      ...customerKeys.map((key) => db.collection('offerUsage').doc(`${offer.offerId}_${key}`)),
    ]);
    const offerRefs = endedOfferIds.map((id) => db.collection('offers').doc(id));
    const [snaps, offerSnaps] = await Promise.all([
      Promise.all(refs.map((ref) => tx.get(ref))),
      Promise.all(offerRefs.map((ref) => tx.get(ref))),
    ]);
    const now = FieldValue.serverTimestamp();
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      tx.set(
        refs[index]!,
        { count: Math.max(0, readCount(snap.data()?.['count']) - 1), updatedAt: now },
        { merge: true },
      );
    });
    offerSnaps.forEach((snap, index) => {
      const data = snap.data();
      if (!snap.exists || data?.['active'] !== false || data?.['updatedBy'] !== OFFER_LIMIT_ACTOR) return;
      tx.update(offerRefs[index]!, { active: true, updatedAt: now });
    });
  });
}

/**
 * What an order saved about the offer uses it took (`offerUses` on `orders/{id}`, written when a
 * Cash on Delivery or InstaPay order is placed), so `cancelOrder` can give exactly those back:
 * the offers it counted, the customer keys it counted them under (a guest order keeps its email
 * key even after `claimOrder` gives it an owner) and the offers its use switched off.
 */
export interface SavedOfferUses {
  readonly offerIds: readonly string[];
  readonly customerKeys: readonly string[];
  readonly switchedOffIds: readonly string[];
}

/** The `offerUses` field an order saves; null when it counted no offer. */
export function savedOfferUses(
  keys: OfferCustomerKeys,
  offers: readonly UsedOffer[],
  switchedOffIds: readonly string[],
): SavedOfferUses | null {
  if (offers.length === 0) return null;
  return {
    offerIds: [...new Set(offers.map((offer) => offer.offerId))],
    customerKeys: customerKeyList(keys),
    switchedOffIds: [...new Set(switchedOffIds)],
  };
}

const MAX_SAVED_IDS = 50;

/**
 * Reads `offerUses` back from an order doc. Orders placed before it existed (or with a field that
 * doesn't look right) give null, so they cancel without giving anything back.
 */
export function parseSavedOfferUses(raw: unknown): SavedOfferUses | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const offerIds = idList(record['offerIds']);
  const customerKeys = idList(record['customerKeys']);
  const switchedOffIds = idList(record['switchedOffIds']);
  if (!offerIds || !customerKeys || !switchedOffIds || offerIds.length === 0) return null;
  return { offerIds, customerKeys, switchedOffIds: switchedOffIds.filter((id) => offerIds.includes(id)) };
}

function idList(raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SAVED_IDS) return null;
  const ids = raw.filter(
    (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/'),
  );
  return ids.length === raw.length ? [...new Set(ids)] : null;
}

/**
 * Gives back the offer uses a cancelled order took, inside the cancel transaction: reads the
 * counts and the offers its use switched off (call before any write in `tx`), and returns a
 * function that writes the give-back (call it with the order's own update). Each
 * `offerUsage/{offerId}` and `offerUsage/{offerId}_{key}` goes down by 1, never below 0 (a
 * missing count doc is left alone). An offer this order switched off is switched back on only
 * while it is still off with `updatedBy: OFFER_LIMIT_ACTOR`; one staff switched off or changed
 * since is left as it is (the same rule as `releaseOfferUses`).
 */
export async function readOfferGiveBack(
  tx: Transaction,
  db: Firestore,
  saved: SavedOfferUses,
): Promise<() => void> {
  const usageRefs = saved.offerIds.flatMap((offerId) => [
    db.collection('offerUsage').doc(offerId),
    ...saved.customerKeys.map((key) => db.collection('offerUsage').doc(`${offerId}_${key}`)),
  ]);
  const offerRefs = saved.switchedOffIds.map((id) => db.collection('offers').doc(id));
  const [usageSnaps, offerSnaps] = await Promise.all([
    Promise.all(usageRefs.map((ref) => tx.get(ref))),
    Promise.all(offerRefs.map((ref) => tx.get(ref))),
  ]);
  return () => {
    const now = FieldValue.serverTimestamp();
    usageSnaps.forEach((snap, index) => {
      if (!snap.exists) return;
      tx.set(
        usageRefs[index]!,
        { count: Math.max(0, readCount(snap.data()?.['count']) - 1), updatedAt: now },
        { merge: true },
      );
    });
    offerSnaps.forEach((snap, index) => {
      const data = snap.data();
      if (!snap.exists || data?.['active'] !== false || data?.['updatedBy'] !== OFFER_LIMIT_ACTOR) return;
      tx.update(offerRefs[index]!, { active: true, updatedAt: now });
    });
  };
}

function readCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}
