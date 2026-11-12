/**
 * Pure rules for Delete Order (admin only). Only an order that is already Cancelled or Payment
 * Failed can be deleted: its stock and offer uses were given back (or never taken), so removing
 * it changes no counts. An open, paid, shipped or delivered order must be cancelled first.
 */

export const ORDER_DELETE_NOT_ALLOWED =
  'Only Cancelled or Payment Failed orders can be deleted. Cancel the order first.';

export function orderDeleteBlockedReason(status: unknown): string | null {
  return status === 'cancelled' || status === 'failed' ? null : ORDER_DELETE_NOT_ALLOWED;
}

export function canDeleteOrderStatus(status: unknown): boolean {
  return orderDeleteBlockedReason(status) === null;
}

/** `{ id }` for a Firestore document id (order or product), or null when it is not one. */
export function readDocIdRequest(raw: unknown, key: 'orderId' | 'productId'): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>)[key];
  if (typeof id !== 'string' || id.length === 0 || id.length > 200 || id.includes('/')) return null;
  if (id === '.' || id === '..' || (id.startsWith('__') && id.endsWith('__'))) return null;
  return id;
}
