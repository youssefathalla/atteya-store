import { SEED_BRANDS, SEED_CATEGORIES } from '@core/services/products/catalog-taxonomy';
import type { Brand, Category } from '@core/services/products/product.model';
import type { ImageAsset } from '@shared/schemas';

export type CatalogKind = 'categories' | 'brands';

/** What the category dialog sends to `saveCategory` (`id` null = add). */
export interface CategoryDraft {
  readonly id: string | null;
  readonly name: string;
  readonly parentId: string | null;
  readonly description: string;
  readonly image: ImageAsset | null;
  /** Grams; null = no default; undefined = leave the saved (or built-in) default alone. */
  readonly defaultWeightGrams?: number | null;
  readonly published: boolean;
}

/** What the brand dialog sends to `saveBrand` (`id` null = add). */
export interface BrandDraft {
  readonly id: string | null;
  readonly name: string;
  readonly logo: ImageAsset | null;
  readonly published: boolean;
}

export interface CategoryTreeRow {
  readonly category: Category;
  readonly children: readonly Category[];
}

export const MAX_CATALOG_NAME = 60;
export const MAX_CATEGORY_DESCRIPTION = 500;
export const MAX_WEIGHT_GRAMS = 100_000;

/** Same words `saveCategory` keeps free (`RESERVED_CATEGORY_SLUGS` in functions). */
const RESERVED_CATEGORY_SLUGS: ReadonlySet<string> = new Set(['all', 'shop', 'new', 'sale', 'best-sellers']);
const SEED_CATEGORY_IDS: ReadonlySet<string> = new Set(SEED_CATEGORIES.map((item) => item.id));
const SEED_BRAND_IDS: ReadonlySet<string> = new Set(SEED_BRANDS.map((item) => item.id));

export function isSeedCategory(id: string): boolean {
  return SEED_CATEGORY_IDS.has(id);
}

export function isSeedBrand(id: string): boolean {
  return SEED_BRAND_IDS.has(id);
}

/** Top-level categories in order, each with its sub-categories in order. */
export function buildCategoryTree(categories: readonly Category[]): readonly CategoryTreeRow[] {
  const sorted = [...categories].sort(bySortOrder);
  const ids = new Set(sorted.map((item) => item.id));
  // A sub-category whose parent is missing is shown at the top level, so it stays reachable.
  const roots = sorted.filter((item) => !item.parentId || !ids.has(item.parentId));
  return roots.map((category) => ({
    category,
    children: sorted.filter((item) => item.parentId === category.id && item.id !== category.id),
  }));
}

export function sortBrands(brands: readonly Brand[]): readonly Brand[] {
  return [...brands].sort(bySortOrder);
}

/**
 * The address a new category or brand will get, the way the server makes it: the name with
 * accents folded, `a-z 0-9` joined by `-`, and `-2`, `-3` when taken. Empty when the name has
 * no letter or digit.
 */
export function previewSlug(name: string, kind: CatalogKind, takenIds: Iterable<string>): string {
  const base = kebab(name.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  if (!base) return '';
  const taken = new Set(takenIds);
  if (kind === 'categories') for (const word of RESERVED_CATEGORY_SLUGS) taken.add(word);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** Same wording as the server's `categoryDeleteBlockedReason`. */
export function categoryDeleteBlockedReason(
  id: string,
  usage: { readonly products: number; readonly subCategories: number },
): string | null {
  if (isSeedCategory(id)) return 'This is one of the store’s built-in categories. You can hide it instead.';
  if (usage.subCategories > 0) {
    return 'This category has sub-categories. Delete or move them first, or hide it instead.';
  }
  if (usage.products > 0) {
    return usage.products === 1
      ? '1 product is in this category. Move it to another category first, or hide it instead.'
      : `${usage.products} products are in this category. Move them to another category first, or hide it instead.`;
  }
  return null;
}

/** Same wording as the server's `brandDeleteBlockedReason`. */
export function brandDeleteBlockedReason(id: string, products: number): string | null {
  if (isSeedBrand(id)) return 'This is one of the store’s built-in brands. You can hide it instead.';
  if (products > 0) {
    return products === 1
      ? '1 product uses this brand. Change its brand first, or hide it instead.'
      : `${products} products use this brand. Change their brand first, or hide it instead.`;
  }
  return null;
}

/** "3 live products", "1 live product", "No live products". */
export function liveCountLabel(count: number): string {
  if (count <= 0) return 'No live products';
  return count === 1 ? '1 live product' : `${count} live products`;
}

/** Reads a typed weight: '' = no default (null), whole grams 0–100,000, else undefined (invalid). */
export function parseWeightGrams(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d{1,6}$/.test(text)) return undefined;
  const grams = Number(text);
  return grams <= MAX_WEIGHT_GRAMS ? grams : undefined;
}

function bySortOrder(a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

function kebab(value: string): string {
  let out = '';
  let pendingDash = false;
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isLetter || isDigit) {
      if (pendingDash && out.length > 0) out += '-';
      out += char;
      pendingDash = false;
    } else if (out.length > 0) {
      pendingDash = true;
    }
  }
  return out;
}
