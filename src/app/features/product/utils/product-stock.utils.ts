import type { ProductVariant } from '@core/services/products';
import type { OptionSelection, ProductView } from '../models/product-page.model';

/** untracked = no stock data (always buyable); unknown = tracked but no variant rows (uses the stored inStock flag) */
export type StockMode = 'untracked' | 'variants' | 'unknown';

export function stockMode(product: ProductView): StockMode {
  if (!product.trackStock) return 'untracked';
  return product.variants.length > 0 ? 'variants' : 'unknown';
}

export function isProductInStock(product: ProductView): boolean {
  if (typeof product.stock === 'number') return product.stock > 0;
  // legacy until PR 1b
  const mode = stockMode(product);
  if (mode === 'unknown') return product.inStock;
  if (mode === 'untracked') return true;
  return product.variants.some((variant) => variant.stock > 0);
}

/** Units left for one size. Null when the product has no size map. */
export function sizeStock(product: ProductView, sizeValueId: string): number | null {
  return product.stockBySize ? (product.stockBySize[sizeValueId] ?? 0) : null;
}

/** A value is selectable if some in-stock variant has it AND agrees with every *other* current pick. */
export function isValueAvailable(
  product: ProductView,
  key: string,
  valueId: string,
  selection: OptionSelection,
): boolean {
  if (!isProductInStock(product)) return false;
  if (typeof product.stock === 'number') {
    if (key === 'size') {
      const sized = sizeStock(product, valueId);
      if (sized !== null) return sized > 0;
    }
    return true;
  }
  // legacy until PR 1b
  if (stockMode(product) !== 'variants') return true;
  return product.variants.some(
    (variant) =>
      variant.stock > 0 &&
      variant.values[key] === valueId &&
      Object.entries(selection).every(
        ([k, id]) => k === key || variant.values[k] === undefined || variant.values[k] === id,
      ),
  );
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
      colour.values.find((val) => isValueAvailable(product, 'colour', val.id, selection)) ??
      colour.values[0];
    if (first) {
      selection['colour'] = first.id;
    }
  }
  return selection;
}
