import { SEED_BRANDS, SEED_CATEGORIES } from '../catalog-taxonomy';
import { CATALOG_BRAND_IDS, CATALOG_CATEGORY_IDS, PRODUCT_TYPE_IDS } from '../product.constants';
import type { CatalogSummary } from '../product.model';

const TYPE_IDS = new Set<string>(PRODUCT_TYPE_IDS);
const SEED_CATEGORY_IDS = new Set<string>([
  ...CATALOG_CATEGORY_IDS,
  ...SEED_CATEGORIES.map((category) => category.id),
  ...SEED_CATEGORIES.map((category) => category.slug),
]);
const SEED_BRAND_IDS = new Set<string>([
  ...CATALOG_BRAND_IDS,
  ...SEED_BRANDS.map((brand) => brand.id),
  ...SEED_BRANDS.map((brand) => brand.slug),
]);

/**
 * True when a nav path points at a known category, type, or brand with no published products.
 * Unknown segments such as sale, best-sellers, and shape filters stay visible.
 */
export function catalogPathIsEmpty(
  summary: CatalogSummary,
  path: string,
  knownCategories: ReadonlySet<string> = SEED_CATEGORY_IDS,
  knownBrands: ReadonlySet<string> = SEED_BRAND_IDS,
): boolean {
  let url: URL;
  try {
    url = new URL(path, 'https://atteya.local');
  } catch {
    return false;
  }

  const parts = url.pathname.split('/').filter((part) => part.length > 0);
  const head = parts[0];
  const id = parts[1]?.toLowerCase();
  const subId = parts[2]?.toLowerCase();

  if (head === 'category') {
    if (subId && isKnown(subId, knownCategories, knownBrands)) {
      if (isEmptyId(summary, subId, knownCategories, knownBrands)) return true;
    } else if (id && isEmptyId(summary, id, knownCategories, knownBrands)) {
      return true;
    }
  } else if (head === 'brand' && id && isEmptyId(summary, id, knownCategories, knownBrands)) {
    return true;
  }

  const cat = url.searchParams.get('cat')?.toLowerCase();
  if (cat && isEmptyId(summary, cat, knownCategories, knownBrands)) return true;
  const type = url.searchParams.get('type')?.toLowerCase();
  if (type && isEmptyId(summary, type, knownCategories, knownBrands)) return true;
  return false;
}

function isKnown(
  id: string,
  knownCategories: ReadonlySet<string>,
  knownBrands: ReadonlySet<string>,
): boolean {
  return knownCategories.has(id) || TYPE_IDS.has(id) || knownBrands.has(id);
}

function isEmptyId(
  summary: CatalogSummary,
  id: string,
  knownCategories: ReadonlySet<string>,
  knownBrands: ReadonlySet<string>,
): boolean {
  return countFor(summary, id, knownCategories, knownBrands) === 0;
}

function countFor(
  summary: CatalogSummary,
  id: string,
  knownCategories: ReadonlySet<string>,
  knownBrands: ReadonlySet<string>,
): number | null {
  if (knownCategories.has(id) && id in summary.categories) return summary.categories[id] ?? 0;
  if (TYPE_IDS.has(id)) return summary.types[id] ?? 0;
  if (knownCategories.has(id)) return summary.categories[id] ?? 0;
  if (knownBrands.has(id)) return summary.brands[id] ?? 0;
  return null;
}
