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
