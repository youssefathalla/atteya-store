import { timingSafeEqual } from 'node:crypto';
import type { CallableRequest } from 'firebase-functions/v2/https';

/** Where return requests are saved (admin and staff read; only Cloud Functions write). */
export const RETURN_REQUESTS_COLLECTION = 'returnRequests';

/**
 * The order's shopper: the signed-in owner (`customerId` = caller uid), or anyone holding the
 * order's secret `viewKey` (a guest's emailed order link). Staff use the admin, not this.
 */
export function isOrderShopper(
  order: Readonly<Record<string, unknown>>,
  request: Pick<CallableRequest, 'auth'>,
  viewKey: string | null,
): boolean {
  const owner = order['customerId'];
  const uid = request.auth?.uid;
  if (uid && typeof owner === 'string' && owner.length > 0 && owner === uid) return true;
  return viewKey !== null && sameKey(order['viewKey'], viewKey);
}

/** Constant-time comparison of the stored key with the one the caller sent. */
function sameKey(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string' || stored.length === 0) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
