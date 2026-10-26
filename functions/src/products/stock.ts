export interface StockInput {
  readonly trackStock: unknown;
  readonly variants: unknown;
  /** EasyOrders product-level quantity. `undefined` = not known (e.g. backfill from Firestore). */
  readonly productQuantity?: unknown;
}

/** Derived stock flag. Returns null only when the answer needs a product-level quantity we don't have. */
export function deriveInStock(input: StockInput): boolean | null {
  if (input.trackStock === false) return true;
  if (Array.isArray(input.variants) && input.variants.length > 0) {
    return input.variants.some((variant) => {
      if (typeof variant !== 'object' || variant === null) return false;
      const stock = (variant as { stock?: unknown }).stock;
      return typeof stock === 'number' && Number.isFinite(stock) && stock > 0;
    });
  }
  if (input.productQuantity === undefined) return null;
  const quantity = input.productQuantity;
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
}
