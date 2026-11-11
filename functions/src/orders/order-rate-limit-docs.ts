import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { OrderCustomer } from './order-customer.js';
import {
  guestEmailRateLimitId,
  guestIpRateLimitId,
  guestRateLimitExpireAt,
  guestStoreRateLimitId,
  MAX_GUEST_ORDERS_PER_UTC_DAY,
  nextDailyOrderCount,
  nextGuestEmailOrderCount,
  nextGuestIpOrderCount,
  nextGuestStoreOrderCount,
} from './order-rate-limit.js';

interface Counter {
  readonly ref: DocumentReference;
  readonly next: (raw: unknown) => number;
  /** Fields saved next to `count`. */
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface OrderRateLimitReservation {
  /** Saves the new counts. Call after every other read in the transaction. */
  readonly write: () => void;
  /** True when this order used the last store-wide guest slot of the day (log it after commit). */
  readonly filledGuestStoreCap: boolean;
}

/**
 * The `orderRateLimits` counters an order counts toward. A signed-in shopper: `{uid}_{day}` (20 a
 * day). A guest: the store-wide `guest_all_{day}` (200), `guest_ip_{hash}_{day}` (5) and
 * `guest_email_{sha256}_{day}` (5), each with `expireAt` 2 days later for a TTL policy. Signed-in
 * orders never count toward the guest caps.
 */
function counters(db: Firestore, customer: OrderCustomer, day: string): Counter[] {
  const limits = db.collection('orderRateLimits');
  if (customer.kind === 'account') {
    return [
      {
        ref: limits.doc(`${customer.uid}_${day}`),
        next: nextDailyOrderCount,
        extra: { uid: customer.uid, day },
      },
    ];
  }
  const extra = { day, expireAt: guestRateLimitExpireAt() };
  return [
    { ref: limits.doc(guestStoreRateLimitId(day)), next: nextGuestStoreOrderCount, extra },
    { ref: limits.doc(guestIpRateLimitId(customer.ipHash, day)), next: nextGuestIpOrderCount, extra },
    {
      ref: limits.doc(guestEmailRateLimitId(customer.emailHash, day)),
      next: nextGuestEmailOrderCount,
      extra,
    },
  ];
}

/** Reads the counters in `tx` and refuses the order (`resource-exhausted`) when one is full. */
export async function readOrderRateLimits(
  tx: Transaction,
  db: Firestore,
  customer: OrderCustomer,
  day: string,
): Promise<OrderRateLimitReservation> {
  const list = counters(db, customer, day);
  const snaps = await Promise.all(list.map((counter) => tx.get(counter.ref)));
  const nextCounts = list.map((counter, index) => counter.next(snaps[index]?.data()?.['count']));
  const filledGuestStoreCap = customer.kind === 'guest' && nextCounts[0] === MAX_GUEST_ORDERS_PER_UTC_DAY;
  return {
    filledGuestStoreCap,
    write: () => {
      const now = FieldValue.serverTimestamp();
      list.forEach((counter, index) => {
        tx.set(counter.ref, { ...counter.extra, count: nextCounts[index], updatedAt: now }, { merge: true });
      });
    },
  };
}

/** Best-effort undo of a reserved slot when the Paymob start or the order write fails. */
export async function releaseOrderRateLimits(
  db: Firestore,
  customer: OrderCustomer,
  day: string,
): Promise<void> {
  const list = counters(db, customer, day);
  await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(list.map((counter) => tx.get(counter.ref)));
    const now = FieldValue.serverTimestamp();
    list.forEach((counter, index) => {
      const raw = snaps[index]?.data()?.['count'];
      const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
      tx.set(
        counter.ref,
        { ...counter.extra, count: Math.max(0, count - 1), updatedAt: now },
        { merge: true },
      );
    });
  });
}

/** Real guests are refused until UTC midnight once the store-wide cap is reached. */
export function logGuestStoreCapReached(day: string): void {
  logger.error('Guest orders reached the store-wide daily cap', { day, cap: MAX_GUEST_ORDERS_PER_UTC_DAY });
}
