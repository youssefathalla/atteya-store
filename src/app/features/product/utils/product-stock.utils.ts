import type { ProductVariant } from '@core/services/products';
import type { OptionSelection, ProductView } from '../models/product-page.model';

/** `stock` decides when it is a number; a product without a count yet uses its stored `inStock` flag. */
export function isProductInStock(product: ProductView): boolean {
  if (typeof product.stock === 'number') return product.stock > 0;
  return product.inStock;
}

/** Units left for one size. Null when the product has no size map. */
export function sizeStock(product: ProductView, sizeValueId: string): number | null {
  return product.stockBySize ? (product.stockBySize[sizeValueId] ?? 0) : null;
}

/** A size is selectable while it has units left; every other option follows the product's stock. */
export function isValueAvailable(product: ProductView, key: string, valueId: string): boolean {
  if (!isProductInStock(product)) return false;
  if (key === 'size') {
    const sized = sizeStock(product, valueId);
    if (sized !== null) return sized > 0;
  }
  return true;
}

/** Variant matching every option the variants actually use; null until the selection is complete. */
export function findVariant(product: ProductView, selection: OptionSelection): ProductVariant | null {
  if (product.options.some((option) => !selection[option.key])) return null;
  return (
    product.variants.find((variant) =>
      Object.entries(variant.values).every(([k, id]) => selection[k] === id),
    ) ?? null
  );
}

/** Auto-pick single-value options; pre-pick the first in-stock colour. Never pre-pick a size. */
export function initialSelection(product: ProductView): OptionSelection {
  const selection: Record<string, string> = {};
  for (const option of product.options) {
    if (option.values.length === 1) {
      selection[option.key] = option.values[0].id;
    }
  }
  const colour = product.options.find((option) => option.key === 'colour');
  if (colour && !selection['colour']) {
    const first =
      colour.values.find((val) => isValueAvailable(product, 'colour', val.id)) ?? colour.values[0];
    if (first) {
      selection['colour'] = first.id;
    }
  }
  return selection;
}
