import {
  CATALOG_BRAND_IDS,
  CATALOG_CATEGORY_IDS,
  PRODUCT_TYPE_IDS,
} from '../product.constants';
import type { CatalogSummary } from '../product.model';

const TYPE_IDS = new Set<string>(PRODUCT_TYPE_IDS);
const CATEGORY_IDS = new Set<string>(CATALOG_CATEGORY_IDS);
const BRAND_IDS = new Set<string>(CATALOG_BRAND_IDS);

/**
 * True when a nav path points at a known category, type, or brand with no published products.
 * Unknown segments such as sale, tracksuits, and shape filters stay visible.
 */
export function catalogPathIsEmpty(summary: CatalogSummary, path: string): boolean {
  let url: URL;
  try {
    url = new URL(path, 'https://atteya.local');
  } catch {
    return false;
  }

  const parts = url.pathname.split('/').filter((part) => part.length > 0);
  const head = parts[0];
  const id = parts[1]?.toLowerCase();
  if ((head === 'category' || head === 'brand') && id && isEmptyId(summary, id)) return true;

  const cat = url.searchParams.get('cat')?.toLowerCase();
  if (cat && isEmptyId(summary, cat)) return true;
  const type = url.searchParams.get('type')?.toLowerCase();
  if (type && isEmptyId(summary, type)) return true;
  return false;
}

function isEmptyId(summary: CatalogSummary, id: string): boolean {
  return countFor(summary, id) === 0;
}

function countFor(summary: CatalogSummary, id: string): number | null {
  if (TYPE_IDS.has(id)) return summary.types[id] ?? 0;
  if (CATEGORY_IDS.has(id)) return summary.categories[id] ?? 0;
  if (BRAND_IDS.has(id)) return summary.brands[id] ?? 0;
  return null;
}
