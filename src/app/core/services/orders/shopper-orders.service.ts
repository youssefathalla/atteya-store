import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { orderStage } from '@core/config/order-messages';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import { orderMessageInput } from './order-message-input';
import { shortOrderRef } from './order-ref';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from './order.schema';
import { orderStatusName } from './order-status-name';

/** One row of the shopper's order history (Account → Orders, account panel "Latest Order"). */
export interface ShopperOrderRow {
  readonly id: string;
  /** `#A1B2C3` from `shortOrderRef()`. */
  readonly ref: string;
  /** Placed date, e.g. "8 Nov 2026"; empty when unknown. */
  readonly placedOn: string;
  /** Total in EGP from the saved order; "+ shipping" while a large order's fee is to be agreed. */
  readonly total: string;
  readonly statusName: string;
  readonly itemCount: number;
  /** Up to 4 item photos saved on the order (older orders have none). */
  readonly photos: readonly ShopperOrderPhoto[];
  /** Steps reached out of Placed, Confirmed, Shipped, Delivered (1–4); 0 when cancelled or failed. */
  readonly progress: number;
}

export interface ShopperOrderPhoto {
  /** ImageKit path for `ngSrc`. */
  readonly src: string;
  /** Storage path for `appImageFallback`. */
  readonly path: string;
  readonly alt: string;
}

/** Placed, Confirmed, Shipped, Delivered: how many the order has reached. */
const ORDER_PROGRESS: Partial<Record<OrderDoc['status'], number>> = {
  pending: 1,
  confirmed: 2,
  shipped: 3,
  delivered: 4,
};
const MAX_PHOTOS = 4;

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The signed-in shopper's own orders, newest first, read live. Firestore rules let a shopper
 * list `orders` only with `customerId == uid` (index `customerId` + `createdAt` desc).
 * A doc that doesn't parse is skipped, never the whole list.
 */
@Service()
export class ShopperOrdersService {
  readonly #firestore = injectFirestore();
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  watch(uid: string, max: number): Observable<readonly ShopperOrderRow[]> {
    if (!this.#isBrowser || !uid) return of([]);
    const ordersQuery = query(
      collection(this.#firestore, ORDERS_COLLECTION),
      where('customerId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    return new Observable<readonly ShopperOrderRow[]>((subscriber) =>
      onSnapshot(
        ordersQuery,
        (snap) => {
          const rows: ShopperOrderRow[] = [];
          for (const docSnap of snap.docs) {
            const parsed = v.safeParse(OrderSchema, {
              ...docSnap.data({ serverTimestamps: 'estimate' }),
              id: docSnap.id,
            });
            if (parsed.success) rows.push(toShopperOrderRow(parsed.output));
          }
          subscriber.next(rows);
        },
        (error) => subscriber.error(error),
      ),
    );
  }

  /** How many orders the shopper has (one count read, not a listener). */
  async count(uid: string): Promise<number> {
    if (!this.#isBrowser || !uid) return 0;
    const snap = await getCountFromServer(
      query(collection(this.#firestore, ORDERS_COLLECTION), where('customerId', '==', uid)),
    );
    return snap.data().count;
  }
}

export function toShopperOrderRow(order: OrderDoc): ShopperOrderRow {
  const input = orderMessageInput(order);
  const stage = orderStage(input);
  const amount = formatMoney(input.totalEgp ?? order.pricing.subtotalEgp, 'EGP', 0);
  const total = input.feeToBeAgreed ? `${amount} + shipping` : amount;
  return {
    id: order.id,
    ref: shortOrderRef(order.id),
    placedOn: placedOn(order.createdAt),
    total,
    statusName: orderStatusName(stage, order.status),
    itemCount: order.pricing.lines.reduce((sum, line) => sum + line.quantity, 0),
    photos: orderPhotos(order),
    progress: ORDER_PROGRESS[order.status] ?? 0,
  };
}

function orderPhotos(order: OrderDoc): ShopperOrderPhoto[] {
  const photos: ShopperOrderPhoto[] = [];
  for (const line of order.pricing.lines) {
    if (photos.length >= MAX_PHOTOS) break;
    if (!line.imagePath || line.gift) continue;
    photos.push({ src: normalizeImageKitPath(line.imagePath), path: line.imagePath, alt: line.name ?? '' });
  }
  return photos;
}

/** A saved order date (Firestore Timestamp, Date or ISO string) as a Date, or null when unreadable. */
export function orderDate(raw: unknown): Date | null {
  let date: Date | null = null;
  if (raw instanceof Date) date = raw;
  else if (raw && typeof raw === 'object' && 'toDate' in raw && typeof raw.toDate === 'function') {
    date = (raw as { toDate: () => Date }).toDate();
  } else if (typeof raw === 'string') date = new Date(raw);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** "8 Nov 2026", or empty when the saved date is unreadable. */
export function placedOn(raw: unknown): string {
  const date = orderDate(raw);
  return date ? DATE_FORMAT.format(date) : '';
}
