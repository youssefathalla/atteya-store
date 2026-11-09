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
