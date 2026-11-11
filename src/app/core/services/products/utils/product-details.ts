/** Most lines a product's details list can hold (same limit as the product form callables). */
export const MAX_DETAIL_LINES = 20;
/** Longest single details line. */
export const MAX_DETAIL_LINE = 200;

/** Categories whose details are what the product is made of. Everything else is gear. */
const MATERIALS_CATEGORY_IDS: ReadonlySet<string> = new Set(['apparel', 'supports']);

export type ProductDetailsTitle = 'Materials' | 'Specifications';

/**
 * Title of the product page section that lists `details`: Materials for clothing,
 * socks and supports, Specifications for gear (rackets, bags, balls, bottles, grips, bundles).
 * `categoryIds` holds the leaf and its parents, so every clothing leaf carries `apparel`.
 */
export function productDetailsTitle(categoryIds: readonly string[]): ProductDetailsTitle {
  return categoryIds.some((id) => MATERIALS_CATEGORY_IDS.has(id)) ? 'Materials' : 'Specifications';
}

/** One details line without a leading bullet and with single spaces (same as the server). */
export function detailLine(value: string): string {
  return value
    .trim()
    .replace(/^•\s*/u, '')
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Textarea text (one fact per line) to the saved list: trimmed, bullets removed, blanks dropped. */
export function detailLinesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(detailLine)
    .filter((line) => line.length > 0);
}
