// Pure (no Angular imports), so `npm run test:cart` can test it.

/**
 * The offer an order callable refused because it has ended for this shopper
 * (`failed-precondition` with `details.endedOfferId`, from its usage limits), or null for any other
 * error. A refusal with `details.changedOfferId` ("Prices in your bag changed") is not one: that
 * offer may still be live, so it is never left out.
 */
export function endedOfferIdFrom(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('details' in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return null;
  const id = (details as { endedOfferId?: unknown }).endedOfferId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** The offer of a "Prices in your bag changed" refusal (`details.changedOfferId`), or null. */
export function changedOfferIdFrom(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('details' in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return null;
  const id = (details as { changedOfferId?: unknown }).changedOfferId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * True for a "Prices in your bag changed" refusal where checkout showed no offer on the line
 * (`details.priceChanged`): the product price went up, so checkout reads the products again.
 */
export function priceChangedFrom(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('details' in error)) return false;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return false;
  return (details as { priceChanged?: unknown }).priceChanged === true;
}

/**
 * Which offer checkout leaves out after a refused order, and the `changedOfferId` to remember for
 * the next try. An `endedOfferId` is always left out. A `changedOfferId` is left out only when the
 * same one comes back twice in a row in one visit, so Place Order can never fail forever on a
 * deal the server keeps refusing.
 */
export function offerToLeaveOut(
  error: unknown,
  lastChangedOfferId: string | null,
): { readonly leaveOut: string | null; readonly lastChangedOfferId: string | null } {
  const ended = endedOfferIdFrom(error);
  if (ended) return { leaveOut: ended, lastChangedOfferId: null };
  const changed = changedOfferIdFrom(error);
  if (changed && changed === lastChangedOfferId) return { leaveOut: changed, lastChangedOfferId: null };
  return { leaveOut: null, lastChangedOfferId: changed };
}

/** The shipping fee and total (whole EGP) the server would charge, from a refused order. */
export interface ServerTotals {
  readonly shippingEgp: number;
  readonly totalEgp: number;
}

/**
 * The server's shipping fee and total from a "Prices in your bag changed" refusal where the
 * order's shipping or total was higher than checkout showed (`details.totalChanged`), or null.
 */
export function totalChangedFrom(error: unknown): ServerTotals | null {
  if (typeof error !== 'object' || error === null || !('details' in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return null;
  const totals = (details as { totalChanged?: unknown }).totalChanged;
  if (typeof totals !== 'object' || totals === null) return null;
  const { shippingEgp, totalEgp } = totals as { shippingEgp?: unknown; totalEgp?: unknown };
  if (!isWholeEgp(shippingEgp) || !isWholeEgp(totalEgp)) return null;
  return { shippingEgp, totalEgp };
}

/** The server's clock (epoch ms) sent with a refusal (`details.nowMs`), or null. */
export function serverClockFrom(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('details' in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return null;
  const nowMs = (details as { nowMs?: unknown }).nowMs;
  return typeof nowMs === 'number' && Number.isFinite(nowMs) && nowMs > 0 ? nowMs : null;
}

/**
 * Which server totals checkout shows in its summary after a refused order, and the totals to
 * remember for the next try. The first refusal shows nothing new (checkout reads the products
 * again and prices on the server's clock, which normally brings the summary in line). When the
 * same totals come back twice in a row, checkout shows them, so the shopper sees what the order
 * costs and Place Order can never fail forever.
 */
export function serverTotalsToShow(
  error: unknown,
  last: ServerTotals | null,
): { readonly show: ServerTotals | null; readonly last: ServerTotals | null } {
  const totals = totalChangedFrom(error);
  if (totals === null) return { show: null, last: null };
  if (last !== null && last.shippingEgp === totals.shippingEgp && last.totalEgp === totals.totalEgp) {
    return { show: totals, last: null };
  }
  return { show: null, last: totals };
}

function isWholeEgp(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
