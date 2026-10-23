export interface PricedProduct {
  readonly price: number;
  readonly compareAtPrice: number | null;
}

export function isOnSale(product: PricedProduct): boolean {
  return product.compareAtPrice !== null && product.compareAtPrice > product.price;
}

/** Whole-number percent off, or null when the product is not on sale. */
export function discountPercent(product: PricedProduct): number | null {
  if (!isOnSale(product) || product.compareAtPrice === null || product.compareAtPrice === 0) {
    return null;
  }
  return Math.round((1 - product.price / product.compareAtPrice) * 100);
}
