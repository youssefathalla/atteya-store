import type { Product } from '@core/services/products/product.model';

/**
 * The options a shopper chose for one bag line, as shown under the item name
 * ("M · Black"). Values the product no longer lists are left out, so a raw id
 * never reaches the page.
 */
export function selectionLabel(
  options: Product['options'],
  selection: Readonly<Record<string, string>>,
): string {
  const parts: string[] = [];
  for (const [key, rawId] of Object.entries(selection)) {
    const id = rawId.trim();
    if (!id) continue;
    const label = options.find((option) => option.key === key)?.values.find((val) => val.id === id)?.label;
    if (label) parts.push(label);
  }
  return parts.join(' · ');
}
