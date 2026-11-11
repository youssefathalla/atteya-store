import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { RequiredCaller } from '../auth/require-role.js';
import { isDeliveryFeeToBeAgreed } from '../store/order-messages.js';
import {
  aggregateOrderStockDemand,
  applyStockReturn,
  nextStockAfterDemand,
  parseOrderStockLines,
  type ProductStockDemand,
} from './decrement-order-stock.js';
import { parseSavedOfferUses, readOfferGiveBack } from './offer-usage.js';
import { orderStaffNotesRef, staffNotesPatch } from './order-staff-notes.js';
import {
  canMoveStatus,
  isManualPayment,
  isOrderStatus,
  orderStatusLabel,
  orderStockTaken,
  stampsClearedBy,
  statusStampField,
  stockMoveFor,
  type OrderStatus,
  type StaffOrderStatus,
} from '../store/order-status.js';

export interface OrderStatusChangeResult {
  readonly orderId: string;
  readonly status: StaffOrderStatus;
  /** False when the order was already in that status (nothing written). */
  readonly changed: boolean;
  /** `take`: items left stock; `return`: they went back; `none`: stock untouched. */
  readonly stock: 'take' | 'return' | 'none';
  /** Pieces that couldn't go back into stock (the size or product is gone). Staff check by hand. */
  readonly notReturned: number;
}

export interface OrderStatusChangeOptions {
  /** Already in the target status: answer `changed: false` instead of refusing. */
  readonly idempotent?: boolean;
  /** Only these current statuses may move (older callables keep their narrower rules). */
  readonly onlyFrom?: readonly OrderStatus[];
  /** Message when `onlyFrom` refuses. */
  readonly onlyFromMessage?: string;
  /** Cancel reason (staff-only), already trimmed; null = none. */
  readonly reason?: string | null;
}

/**
 * Move one order to a new status in a transaction against the live order: checks the move
 * (`allowedStatusMoves`), takes stock on Confirmed once (`stockDecrementedAt`), puts it back on
 * Cancelled or back to Waiting for Payment, gives offer uses back on Cancelled (once,
 * `offerUsesReturnedAt`), stamps `confirmedAt` / `shippedAt` / `deliveredAt` / `cancelledAt`,
 * and appends `statusHistory` to the admin-only `orderStaffNotes/{orderId}` (with `cancelReason`). Used by `setOrderStatus`, `confirmCodOrder` and `cancelOrder`.
 */
export async function changeOrderStatus(
  db: Firestore,
  orderId: string,
  target: StaffOrderStatus,
  actor: RequiredCaller,
  opts: OrderStatusChangeOptions = {},
): Promise<OrderStatusChangeResult> {
  const orderRef = db.collection('orders').doc(orderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'That order could not be found.');
    }
    const order: DocumentData = snap.data() ?? {};
    const current = order['status'];
    if (!isOrderStatus(current)) {
      throw new HttpsError('failed-precondition', "This order's status can't be changed here.");
    }
    if (current === target && opts.idempotent) {
      return { orderId, status: target, changed: false, stock: 'none' as const, notReturned: 0 };
    }
    if (opts.onlyFrom && !opts.onlyFrom.includes(current)) {
      throw new HttpsError('failed-precondition', opts.onlyFromMessage ?? moveRefusal(order, target));
    }
    if (!canMoveStatus(order as { status: unknown; paymentMethod: unknown }, target)) {
      throw new HttpsError('failed-precondition', moveRefusal(order, target));
    }
    if (target === 'confirmed' && current === 'pending') {
      assertConfirmable(order);
    }

    const stockMove = stockMoveFor(target, orderStockTaken(order));
    const stockPlan = stockMove === 'none' ? null : await readStockPlan(tx, db, order);

    const saved =
      target === 'cancelled' && !order['offerUsesReturnedAt']
        ? parseSavedOfferUses(order['offerUses'])
        : null;
    const giveBack = saved ? await readOfferGiveBack(tx, db, saved) : null;

    // Every read is done; writes from here on.
    const now = FieldValue.serverTimestamp();
    let notReturned = 0;
    if (stockPlan) {
      for (const item of stockPlan) {
        let next;
        if (stockMove === 'take') {
          next = takeStock(item.data, item.demand);
        } else {
          const back = item.data ? applyStockReturn(stockSnapshot(item.data), item.demand) : null;
          notReturned += back ? back.skipped : demandPieces(item.demand);
          next = back?.next;
        }
        if (!next) continue;
        tx.update(item.ref, {
          stock: next.stock,
          inStock: next.inStock,
          stockBySize: next.stockBySize ?? FieldValue.delete(),
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }
    }
    giveBack?.();

    // Who and why stay staff-only: the owner can read `orders/{id}`, so they go to orderStaffNotes.
    tx.set(
      orderStaffNotesRef(db, orderId),
      staffNotesPatch(
        {
          status: target,
          from: current,
          at: Timestamp.now(),
          by: actor.uid,
          ...(actor.email ? { byEmail: actor.email } : {}),
          ...(target === 'cancelled' && opts.reason ? { reason: opts.reason } : {}),
        },
        target === 'cancelled' ? (opts.reason ?? null) : undefined,
      ),
      { merge: true },
    );
    const patch: DocumentData = {
      status: target,
      updatedAt: now,
    };
    const stamp = statusStampField(target);
    if (stamp) patch[stamp] = now;
    for (const field of stampsClearedBy(current, target)) patch[field] = null;
    if (target === 'pending') patch['confirmedBy'] = null;
    if (target === 'confirmed' && current === 'pending') patch['confirmedBy'] = actor.uid;
    if (target === 'cancelled') {
      patch['cancelledBy'] = actor.uid;
      if (giveBack) patch['offerUsesReturnedAt'] = now;
    }
    if (stockMove === 'take') patch['stockDecrementedAt'] = now;
    if (stockMove === 'return') {
      patch['stockDecrementedAt'] = null;
      patch['stockReturnedAt'] = now;
      // Pieces that had nowhere to go back to (size removed, product deleted): staff check them.
      patch['stockNotReturned'] = notReturned;
      if (notReturned > 0) {
        console.warn('Order stock could not all go back', { orderId, notReturned });
      }
    }
    tx.update(orderRef, patch);

    return { orderId, status: target, changed: true, stock: stockMove, notReturned };
  });
}

interface StockPlanItem {
  readonly ref: DocumentReference;
  /** Null when the product doc no longer exists. */
  readonly data: DocumentData | null;
  readonly demand: ProductStockDemand;
}

async function readStockPlan(tx: Transaction, db: Firestore, order: DocumentData): Promise<StockPlanItem[]> {
  const demandByProduct = aggregateOrderStockDemand(parseOrderStockLines(order));
  const ids = [...demandByProduct.keys()];
  const refs = ids.map((id) => db.collection('products').doc(id));
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
  return ids.map((id, i) => ({
    ref: refs[i]!,
    data: snaps[i]!.exists ? (snaps[i]!.data() ?? {}) : null,
    demand: demandByProduct.get(id)!,
  }));
}

function stockSnapshot(data: DocumentData | null) {
  return {
    stock: data?.['stock'],
    stockBySize: data?.['stockBySize'],
    options: data?.['options'],
  };
}

/** Same rule as `confirmCodOrder` always had: a missing product or too little stock refuses. */
function takeStock(data: DocumentData | null, demand: ProductStockDemand) {
  if (!data) {
    throw new HttpsError(
      'failed-precondition',
      'One product on this order no longer exists. Stock cannot be updated.',
    );
  }
  return nextStockAfterDemand(stockSnapshot(data), demand);
}

function assertConfirmable(order: DocumentData): void {
  if (!isManualPayment(order['paymentMethod'])) {
    throw new HttpsError(
      'failed-precondition',
      'Only Cash on Delivery and InstaPay orders are confirmed here. Card payments confirm on their own.',
    );
  }
  const shipping = isRecord(order['shipping']) ? order['shipping'] : null;
  const country = shipping && typeof shipping['country'] === 'string' ? shipping['country'] : '';
  const pricing = isRecord(order['pricing']) ? order['pricing'] : null;
  const fulfilment = pricing && typeof pricing['fulfilment'] === 'string' ? pricing['fulfilment'] : '';
  if (country !== 'EG' && fulfilment !== 'domestic-cod' && fulfilment !== 'domestic-instapay') {
    throw new HttpsError('failed-precondition', 'Only Egypt orders are confirmed here.');
  }
  if (isDeliveryFeeToBeAgreed(pricing?.['shipping'])) {
    throw new HttpsError(
      'failed-precondition',
      'Set the delivery fee you agreed with the customer before confirming this order.',
    );
  }
}

function moveRefusal(order: DocumentData, target: StaffOrderStatus): string {
  const current = order['status'];
  if (current === 'cancelled' || current === 'failed') {
    return `This order is ${orderStatusLabel(current).toLowerCase()}, so its status can't change.`;
  }
  if (order['paymentMethod'] === 'paymob') {
    if (current === 'pending' || target === 'pending') {
      return "Card orders can't be changed while the payment is open. They update on their own when the payment clears or fails.";
    }
    if (target === 'cancelled') {
      return "Paid card orders can't be cancelled here, because the payment can't be refunded from the dashboard yet.";
    }
  }
  if (isOrderStatus(current)) {
    return `An order that is ${orderStatusLabel(current)} can't be marked as ${orderStatusLabel(target)}. Refresh the list and try again.`;
  }
  return "This order's status can't be changed here.";
}

function demandPieces(demand: ProductStockDemand): number {
  if (demand.kind === 'flat') return demand.quantity;
  return Object.values(demand.bySize).reduce((sum, qty) => sum + qty, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
