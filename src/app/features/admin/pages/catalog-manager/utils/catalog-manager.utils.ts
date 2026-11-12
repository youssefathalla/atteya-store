import {
  BUILT_IN_CATEGORY_PAGE,
  SEED_BRANDS,
  SEED_CATEGORIES,
  type CategoryDetailsTitle,
  type CategorySizeChart,
} from '@core/services/products/catalog-taxonomy';
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
  /** "Name on Shop Tabs" for a top-level category; '' = none (ATS-249). */
  readonly shopLabel?: string;
  /** Size Chart (ATS-250); null = same as the parent. */
  readonly sizeChart?: CategorySizeChart | null;
  /** Details Title (ATS-250); null = same as the parent. */
  readonly detailsTitle?: CategoryDetailsTitle | null;
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
/** Same limit as `MAX_SHOP_LABEL` in `functions/src/products/catalog-admin.ts`. */
export const MAX_SHOP_LABEL = 30;
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

/**
 * Why a category can't be deleted, in plain words with what to do instead, or null when it can.
 * The server checks the same things (plus offers) and refuses with its own message.
 */
export function categoryDeleteBlockedReason(
  category: { readonly id: string; readonly name: string },
  usage: { readonly products: number; readonly subCategories: number },
): string | null {
  const { name } = category;
  if (usage.products > 0) {
    return usage.products === 1
      ? `${name} still has 1 product. Move it to another category first, or hide ${name} instead.`
      : `${name} still has ${usage.products} products. Move them to another category first, or hide ${name} instead.`;
  }
  if (usage.subCategories > 0) {
    return usage.subCategories === 1
      ? `${name} still has 1 category inside it. Delete that one first, or hide ${name} instead.`
      : `${name} still has ${usage.subCategories} categories inside it. Delete those first, or hide ${name} instead.`;
  }
  if (isSeedCategory(category.id)) {
    return `${name} is one of the store’s built-in categories, so it can’t be deleted. You can hide it instead.`;
  }
  return null;
}

/** Why a brand can't be deleted, in plain words with what to do instead, or null when it can. */
export function brandDeleteBlockedReason(
  brand: { readonly id: string; readonly name: string },
  products: number,
): string | null {
  const { name } = brand;
  if (products > 0) {
    return products === 1
      ? `${name} still has 1 product. Change its brand first, or hide ${name} instead.`
      : `${name} still has ${products} products. Change their brand first, or hide ${name} instead.`;
  }
  if (isSeedBrand(brand.id)) {
    return `${name} is one of the store’s built-in brands, so it can’t be deleted. You can hide it instead.`;
  }
  return null;
}

/** The short count on a row: "61 live", "None live". */
export function liveCountLabel(count: number): string {
  return count > 0 ? `${count} live` : 'None live';
}

/** "6 inside", "1 inside"; empty when nothing is inside. */
export function insideLabel(count: number): string {
  return count > 0 ? `${count} inside` : '';
}

/**
 * What the switch asks before hiding something shoppers can buy, or null when it can hide at
 * once (nothing live in it).
 */
export function hideConfirmMessage(name: string, liveProducts: number): string | null {
  if (liveProducts <= 0) return null;
  const products = liveProducts === 1 ? 'Its 1 product stays' : `Its ${liveProducts} products stay`;
  return `${products} saved but shoppers won’t find ${liveProducts === 1 ? 'it' : 'them'} under ${name}.`;
}

/** The snackbar after the switch: "Hoodies is hidden from the store." / "Hoodies is on the store." */
export function shownSnackbar(name: string, shown: boolean): string {
  return shown ? `${name} is on the store.` : `${name} is hidden from the store.`;
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

/** A Size Chart or Details Title choice in the category dialog; `parent` = same as the parent. */
export type CategoryPageChoice<T extends string> = T | 'parent';

/**
 * What the category dialog shows for a field (ATS-250): the saved value, `parent` for a saved null,
 * else the built-in default, else `parent` for a sub-category and `fallback` for a top-level one.
 */
export function categoryPageChoice<K extends 'sizeChart' | 'detailsTitle'>(
  category: Pick<Category, 'id' | 'depth' | K>,
  field: K,
  fallback: NonNullable<Category[K]>,
): CategoryPageChoice<NonNullable<Category[K]>> {
  const saved = category[field];
  if (saved === null) return category.depth === 0 ? fallback : 'parent';
  if (saved !== undefined) return saved as NonNullable<Category[K]>;
  const builtIn = BUILT_IN_CATEGORY_PAGE[category.id]?.[field] as NonNullable<Category[K]> | undefined;
  return builtIn ?? (category.depth === 0 ? fallback : 'parent');
}

/** How the Category and Brand windows open: 36rem wide, full screen on phone (`_dialog.scss`). */
export const CATALOG_DIALOG_CONFIG = {
  width: '36rem',
  maxWidth: '96vw',
  autoFocus: 'first-tabbable',
  panelClass: 'catalog-dialog-pane',
} as const;
