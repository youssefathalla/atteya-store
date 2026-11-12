/**
 * Pure rules for Delete Order (admin only). Only an order that is already Cancelled or Payment
 * Failed can be deleted: its stock and offer uses were given back (or never taken), so removing
 * it changes no counts. An open, paid, shipped or delivered order must be cancelled first.
 */

import { PAYMOB_INTENTION_DEFAULT_EXPIRY_SECONDS } from '../paymob/paymob-client.js';

export const ORDER_DELETE_NOT_ALLOWED =
  'Only Cancelled or Payment Failed orders can be deleted. Cancel the order first.';

export function orderDeleteBlockedReason(status: unknown): string | null {
  return status === 'cancelled' || status === 'failed' ? null : ORDER_DELETE_NOT_ALLOWED;
}

export function canDeleteOrderStatus(status: unknown): boolean {
  return orderDeleteBlockedReason(status) === null;
}

/**
 * A Payment Failed card order is not final for Paymob: the shopper can retry on the same checkout
 * until the intention expires, and a later clean capture still confirms the order. Wait out the
 * intention's expiry plus a margin before it can be deleted, so a late payment is never lost.
 */
export const PAYMOB_FAILED_DELETE_WAIT_MS = (PAYMOB_INTENTION_DEFAULT_EXPIRY_SECONDS + 30 * 60) * 1000;

export const PAYMOB_FAILED_DELETE_TOO_SOON =
  'The customer can still retry this card payment. Try deleting it again in an hour or two.';

export function paymobFailedDeleteBlockedReason(
  order: { readonly status: unknown; readonly paymentMethod: unknown; readonly createdAtMs: number | null },
  nowMs: number,
): string | null {
  if (order.status !== 'failed' || order.paymentMethod !== 'paymob') return null;
  if (order.createdAtMs === null || !Number.isFinite(order.createdAtMs)) {
    return PAYMOB_FAILED_DELETE_TOO_SOON;
  }
  return nowMs - order.createdAtMs >= PAYMOB_FAILED_DELETE_WAIT_MS ? null : PAYMOB_FAILED_DELETE_TOO_SOON;
}

/** `{ id }` for a Firestore document id (order or product), or null when it is not one. */
export function readDocIdRequest(raw: unknown, key: 'orderId' | 'productId'): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>)[key];
  if (typeof id !== 'string' || id.length === 0 || id.length > 200 || id.includes('/')) return null;
  if (id === '.' || id === '..' || (id.startsWith('__') && id.endsWith('__'))) return null;
  return id;
}
