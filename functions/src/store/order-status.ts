/**
 * Order status moves staff may make from the admin (`setOrderStatus`), and what each move does to
 * stock. Pure: no Firestore, so the move table is unit tested (`orders/order-status.test.ts`).
 * The admin dropdown reads the same table: edit ONLY this file (functions/src/store/order-status.ts),
 * then run `npm run sync:engine`, which copies it to src/app/core/config/order-status.ts.
 *
 * Waiting for Payment (`pending`, Cash on Delivery / InstaPay / Bank Transfer only) → Confirmed, Cancelled
 * Confirmed → Shipped, Cancelled, back to Waiting for Payment (Cash on Delivery / InstaPay / Bank Transfer only)
 * Shipped → Delivered, back to Confirmed
 * Delivered → back to Shipped (not while a return or exchange request holds pieces, ATS-297)
 * Cancelled and Payment Failed are final. Card (Paymob) orders: `pending` / `failed` are set by
 * Paymob only, and a paid card order is never cancelled here (refunds are not built).
 */

import { hasReturnHoldingPieces } from './returns.js';

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'failed';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'failed',
];

/** Statuses a staff member can choose in the dropdown. */
export type StaffOrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export const CANCEL_REASON_MAX = 300;

/** Why Back to Shipped is refused while a return or exchange request holds pieces. */
export const RETURN_BLOCKS_STEP_BACK_MESSAGE =
  'This order has a return or exchange. Finish or reject it first, then change the order.';

export interface OrderStatusFacts {
  readonly status: unknown;
  readonly paymentMethod: unknown;
  /** The order's raw `returns` array. A request that holds pieces blocks the step back from Delivered. */
  readonly returns?: unknown;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

function isStaffStatus(value: unknown): value is StaffOrderStatus {
  return (
    value === 'pending' ||
    value === 'confirmed' ||
    value === 'shipped' ||
    value === 'delivered' ||
    value === 'cancelled'
  );
}

/** Paid outside Paymob and confirmed by staff: Cash on Delivery, InstaPay or Bank Transfer. */
export function isManualPayment(method: unknown): boolean {
  return method === 'cash-on-delivery' || method === 'instapay' || method === 'bank-transfer';
}

/** The statuses staff may move this order to now, in the order the dropdown lists them. */
export function allowedStatusMoves(order: OrderStatusFacts): StaffOrderStatus[] {
  const manual = isManualPayment(order.paymentMethod);
  const card = order.paymentMethod === 'paymob';
  if (!manual && !card) return [];
  switch (order.status) {
    case 'pending':
      return manual ? ['confirmed', 'cancelled'] : [];
    case 'confirmed':
      return manual ? ['shipped', 'pending', 'cancelled'] : ['shipped'];
    case 'shipped':
      return ['delivered', 'confirmed'];
    case 'delivered':
      // A step back could end in Cancelled, which puts every line back into stock, on top of the
      // pieces a return already put back or an exchange already took.
      return hasReturnHoldingPieces(order.returns) ? [] : ['shipped'];
    default:
      return [];
  }
}

/** Delivered, with a return or exchange request that still holds pieces. */
export function returnBlocksStepBack(order: OrderStatusFacts): boolean {
  return order.status === 'delivered' && hasReturnHoldingPieces(order.returns);
}

export function canMoveStatus(order: OrderStatusFacts, target: StaffOrderStatus): boolean {
  return allowedStatusMoves(order).includes(target);
}

/**
 * Whether the items of this order are out of stock right now. `stockDecrementedAt` is set when
 * stock is taken and cleared (null) when it is put back. Orders confirmed before that stamp
 * existed (no field at all) took stock on their confirm, so a confirmed, shipped or delivered
 * order without the field counts as taken.
 */
export function orderStockTaken(order: Readonly<Record<string, unknown>>): boolean {
  if (Object.hasOwn(order, 'stockDecrementedAt')) {
    return order['stockDecrementedAt'] != null;
  }
  const status = order['status'];
  return status === 'confirmed' || status === 'shipped' || status === 'delivered';
}

export type StockMove = 'take' | 'return' | 'none';

/**
 * What a move does to stock: Confirmed takes the items once (never twice after a step back);
 * Cancelled and back to Waiting for Payment put them back when they were taken.
 */
export function stockMoveFor(target: StaffOrderStatus, stockTaken: boolean): StockMove {
  if (target === 'confirmed') return stockTaken ? 'none' : 'take';
  if (target === 'cancelled' || target === 'pending') return stockTaken ? 'return' : 'none';
  return 'none';
}

/** Trimmed, at most 300 characters; empty = no reason. */
export function cleanCancelReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, CANCEL_REASON_MAX) : null;
}

export interface SetOrderStatusRequest {
  readonly orderId: string;
  readonly status: StaffOrderStatus;
  readonly reason: string | null;
}

/** Null when the request is not usable (the callable answers invalid-argument). */
export function parseSetOrderStatusRequest(raw: unknown): SetOrderStatusRequest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const orderId = data['orderId'];
  if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 200 || orderId.includes('/')) {
    return null;
  }
  const status = data['status'];
  if (!isStaffStatus(status)) return null;
  const reasonRaw = data['reason'];
  if (reasonRaw !== undefined && reasonRaw !== null && typeof reasonRaw !== 'string') return null;
  if (typeof reasonRaw === 'string' && reasonRaw.trim().length > CANCEL_REASON_MAX) return null;
  return { orderId, status, reason: status === 'cancelled' ? cleanCancelReason(reasonRaw) : null };
}

/** The field stamped with the time of each move (`confirmedAt`, `shippedAt`, …). */
export function statusStampField(status: StaffOrderStatus): string | null {
  switch (status) {
    case 'confirmed':
      return 'confirmedAt';
    case 'shipped':
      return 'shippedAt';
    case 'delivered':
      return 'deliveredAt';
    case 'cancelled':
      return 'cancelledAt';
    case 'pending':
      return null;
  }
}

/**
 * Stamps a step back clears, so the shopper's page un-ticks the step it left: back to Shipped
 * clears `deliveredAt`, back to Confirmed clears `shippedAt`, back to Waiting for Payment clears
 * `confirmedAt`.
 */
export function stampsClearedBy(from: OrderStatus, to: StaffOrderStatus): string[] {
  if (from === 'delivered' && to === 'shipped') return ['deliveredAt'];
  if (from === 'shipped' && to === 'confirmed') return ['shippedAt'];
  if (from === 'confirmed' && to === 'pending') return ['confirmedAt'];
  return [];
}

/** Title-case status names (`orderStatusName()` on the website uses the same words). */
export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'Waiting for Payment';
    case 'confirmed':
      return 'Confirmed';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Payment Failed';
  }
}
