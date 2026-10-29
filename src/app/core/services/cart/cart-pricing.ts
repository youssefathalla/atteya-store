import type { CartLineDraft } from './cart.model';

/**
 * Line total in the visitor's display currency.
 * Pass the already-converted unit amount (`toDisplayAmount`), matching order pricing
 * which multiplies display units by quantity after conversion.
 */
export function lineDisplayAmount(unitDisplay: number, quantity: number): number {
  if (!Number.isFinite(unitDisplay) || !Number.isInteger(quantity) || quantity < 1) return 0;
  return unitDisplay * quantity;
}

/** Sum of line display amounts. Missing unit prices are skipped. */
export function cartSubtotalDisplay(
  lines: readonly Pick<CartLineDraft, 'productId' | 'quantity'>[],
  unitDisplayByProductId: ReadonlyMap<string, number>,
): number {
  let sum = 0;
  for (const line of lines) {
    const unit = unitDisplayByProductId.get(line.productId);
    if (typeof unit !== 'number' || !Number.isFinite(unit)) continue;
    sum += lineDisplayAmount(unit, line.quantity);
  }
  return sum;
}

/** Checkout is available only when the bag has at least one line. */
export function canCheckout(hasItems: boolean): boolean {
  return hasItems;
}
