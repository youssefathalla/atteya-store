export interface SetProductPublishedRequest {
  readonly productId: string;
  readonly published: boolean;
}

/** The parsed request, or the message for the admin when it is wrong. */
export function readSetProductPublishedRequest(raw: unknown): SetProductPublishedRequest | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'Choose a product and try again.';
  }
  const data = raw as Record<string, unknown>;
  const productId = data['productId'];
  if (
    typeof productId !== 'string' ||
    productId.length === 0 ||
    productId.length > 200 ||
    productId.includes('/')
  ) {
    return 'Choose a product and try again.';
  }
  if (typeof data['published'] !== 'boolean') {
    return 'Choose whether to show this product on the store.';
  }
  return { productId, published: data['published'] };
}

/** Same rule as the product editor: a product needs a photo before it goes live. */
export function publishBlockedReason(published: boolean, images: unknown): string | null {
  if (!published) return null;
  const count = Array.isArray(images) ? images.length : 0;
  return count > 0 ? null : 'Add at least one photo before showing it on the store.';
}
