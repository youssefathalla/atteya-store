/**
 * Pure rules for the admin Categories & Brands screen (ATS-245): reading the callable
 * requests and working out a new category's or brand's id, slug and place in the tree.
 * Tested in catalog-admin.test.ts. The callables live in catalog-admin.fn.ts.
 */
import {
  CATEGORY_DETAILS_TITLES,
  CATEGORY_SIZE_CHARTS,
  SEED_BRANDS,
  SEED_CATEGORIES,
  type CategoryDetailsTitle,
  type CategorySizeChart,
} from './catalog-taxonomy.js';
import { kebabSlug, nextSlug } from './slug.js';

export const MAX_CATALOG_NAME = 60;
export const MAX_CATEGORY_DESCRIPTION = 500;
/** "Name on Shop Tabs" (`shopLabel`): short enough for a tab button. */
export const MAX_SHOP_LABEL = 30;
export const MAX_IMAGE_ALT = 125;
export const MAX_WEIGHT_GRAMS = 100_000;
/** Most categories or brands one reorder can send. */
export const MAX_REORDER = 200;

/**
 * Words the storefront already uses after `/category/` for something else (`/category/all` and
 * `/category/shop` redirect to Shop, and the merchandising paths are reserved).
 */
export const RESERVED_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  'all',
  'shop',
  'new',
  'sale',
  'best-sellers',
]);

export const SEED_CATEGORY_IDS: ReadonlySet<string> = new Set(SEED_CATEGORIES.map((item) => item.id));
export const SEED_BRAND_IDS: ReadonlySet<string> = new Set(SEED_BRANDS.map((item) => item.id));

export interface CatalogImage {
  readonly path: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

export interface SaveCategoryRequest {
  /** Null when adding a new category. */
  readonly id: string | null;
  readonly name: string;
  /** Read only when adding; the parent never changes afterwards. */
  readonly parentId: string | null;
  readonly description: string;
  readonly image: CatalogImage | null;
  /** Grams; null = no default on purpose; undefined = leave as it is (built-in default). */
  readonly defaultWeightGrams: number | null | undefined;
  /**
   * "Name on Shop Tabs" for a top-level category: '' = none (the tab uses the built-in name or the
   * category name); missing = leave as it is (an older admin page that doesn't send it).
   */
  readonly shopLabel?: string;
  /**
   * Size & Fit chart on product pages (ATS-250): null = same as the parent (saved as null, so the
   * built-in default never comes back); missing = leave as it is (an older admin page).
   */
  readonly sizeChart?: CategorySizeChart | null;
  /** Materials or Specifications on product pages; null and missing as for `sizeChart`. */
  readonly detailsTitle?: CategoryDetailsTitle | null;
  readonly published: boolean;
}

export interface SaveBrandRequest {
  readonly id: string | null;
  readonly name: string;
  readonly logo: CatalogImage | null;
  readonly published: boolean;
}

export interface DeleteRequest {
  readonly id: string;
  /** True: only say whether it can be deleted and which offers name it; delete nothing. */
  readonly check: boolean;
}

export interface ReorderRequest {
  readonly kind: 'categories' | 'brands';
  readonly ids: readonly string[];
}

/** Turns a shown name into a link name: accents folded, `a-z 0-9` joined by `-`. */
export function catalogSlugFromName(name: string): string {
  const folded = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return kebabSlug(folded);
}

/**
 * The id (also the slug) for a new category or brand: its name as a link name, with `-2`, `-3`
 * when that is already taken. Null when the name has no letter or digit to build one from.
 */
export function newCatalogId(name: string, taken: ReadonlySet<string>): string | null {
  const base = catalogSlugFromName(name);
  if (!base) return null;
  return nextSlug(base, taken);
}

export interface CategoryPlacement {
  readonly parentId: string | null;
  readonly ancestorIds: readonly string[];
  readonly path: string;
  readonly depth: 0 | 1;
}

/** Where a new category sits: top level, or under a top-level parent (two levels only). */
export function categoryPlacement(
  slug: string,
  parent: { readonly id: string; readonly path: string; readonly depth: number } | null,
): CategoryPlacement | string {
  if (!parent) return { parentId: null, ancestorIds: [], path: slug, depth: 0 };
  if (parent.depth !== 0) return 'Pick a top-level category as the parent.';
  return { parentId: parent.id, ancestorIds: [parent.id], path: `${parent.path}/${slug}`, depth: 1 };
}

/** Products in a category or of a brand, split by shown on the store or not (ATS-265). */
export interface CatalogProductUsage {
  readonly live: number;
  readonly hidden: number;
}

/** "61 products", "3 hidden products", "58 live and 3 hidden products", "1 product". */
export function productCountPhrase(usage: CatalogProductUsage): string {
  const total = usage.live + usage.hidden;
  const noun = total === 1 ? 'product' : 'products';
  if (usage.hidden === 0) return `${total} ${noun}`;
  if (usage.live === 0) return `${total} hidden ${noun}`;
  return `${usage.live} live and ${usage.hidden} hidden ${noun}`;
}

/**
 * Why a category can't be deleted, or null when it can (ATS-265): it must have no products
 * (shown or hidden) and no categories inside it. Built-in categories follow the same rule, and
 * offers that name it never block (the confirm window lists them instead).
 */
export function categoryDeleteBlockedReason(
  name: string,
  usage: { readonly products: CatalogProductUsage; readonly subCategories: number },
): string | null {
  const total = usage.products.live + usage.products.hidden;
  if (total > 0) {
    const them = total === 1 ? 'it' : 'them';
    return `${name} still has ${productCountPhrase(usage.products)}. Move ${them} to another category first, or hide it instead.`;
  }
  if (usage.subCategories > 0) {
    return usage.subCategories === 1
      ? `Delete or move the category inside ${name} first.`
      : `Delete or move the ${usage.subCategories} categories inside ${name} first.`;
  }
  return null;
}

/** Why a brand can't be deleted, or null when it can: it must have no products, shown or hidden. */
export function brandDeleteBlockedReason(name: string, products: CatalogProductUsage): string | null {
  const total = products.live + products.hidden;
  if (total === 0) return null;
  const their = total === 1 ? 'its' : 'their';
  return `${name} still has ${productCountPhrase(products)}. Change ${their} brand first, or hide it instead.`;
}

/** The `settings/catalog` field listing built-in categories and brands staff deleted (ATS-265). */
export const DELETED_BUILT_IN_FIELD = 'deletedBuiltInIds';

/** True for a built-in (seed) category or brand id. */
export function isBuiltInCatalogId(kind: 'categories' | 'brands', id: string): boolean {
  return kind === 'categories' ? SEED_CATEGORY_IDS.has(id) : SEED_BRAND_IDS.has(id);
}

/** Reads `settings/catalog.deletedBuiltInIds`; anything that isn't a list of ids counts as none. */
export function readDeletedBuiltInIds(raw: unknown): ReadonlySet<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((value): value is string => isCatalogId(value)));
}

/**
 * Splits the built-in seeds into the ones Check catalogue structure still creates or repairs and
 * the ones staff deleted (ATS-265). A seed whose parent was deleted is skipped too, so it never
 * comes back under a category that is gone.
 */
export function seedsToKeep<T extends { readonly id: string; readonly ancestorIds?: readonly string[] }>(
  seeds: readonly T[],
  deleted: ReadonlySet<string>,
): { readonly keep: readonly T[]; readonly deletedByStaff: readonly string[] } {
  const keep: T[] = [];
  const deletedByStaff: string[] = [];
  for (const seed of seeds) {
    if (deleted.has(seed.id) || (seed.ancestorIds ?? []).some((id) => deleted.has(id))) {
      deletedByStaff.push(seed.id);
    } else {
      keep.push(seed);
    }
  }
  return { keep, deletedByStaff };
}

/** True when a name has at least one English letter or digit, so an address can be made from it. */
export function hasEnglishLetterOrDigit(name: string): boolean {
  return catalogSlugFromName(name).length > 0;
}

/** Shown when a new category's or brand's name has no English letter or digit. */
export const ENGLISH_NAME_MESSAGE = 'Use English letters for the name, for example Padel Caps.';

/** Staff name of an offer for the delete window: its name, else its customer title, else its id. */
export function offerDisplayName(id: string, offer: Record<string, unknown>): string {
  for (const key of ['name', 'title']) {
    const value = offer[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return id;
}

/**
 * True when an offer's rules name this category or brand: any condition (anywhere in the offer,
 * so reward and gift rules count too) with `field` set to `categoryIds` / `brandId` whose `in`
 * or `notIn` list holds the id.
 */
export function offerNamesCatalogId(offer: unknown, field: 'categoryIds' | 'brandId', id: string): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): boolean => {
    if (depth > 12 || typeof value !== 'object' || value === null || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some((item) => visit(item, depth + 1));
    const record = value as Record<string, unknown>;
    if (record['field'] === field) {
      const lists = [record['in'], record['notIn']];
      if (lists.some((list) => Array.isArray(list) && list.includes(id))) return true;
    }
    return Object.values(record).some((item) => visit(item, depth + 1));
  };
  return visit(offer, 0);
}

/**
 * Every category or brand id named in an offer's rules (any `categoryIds` / `brandId` condition's
 * `in` or `notIn` list). A new category or brand never takes one of these, so an offer that named a
 * deleted one never starts covering a new one with the same name (ATS-265).
 */
export function offerCatalogIds(offer: unknown): ReadonlySet<string> {
  const ids = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 12 || typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record['field'] === 'categoryIds' || record['field'] === 'brandId') {
      for (const list of [record['in'], record['notIn']]) {
        if (Array.isArray(list)) for (const id of list) if (isCatalogId(id)) ids.add(id);
      }
    }
    for (const item of Object.values(record)) visit(item, depth + 1);
  };
  visit(offer, 0);
  return ids;
}

export function readSaveCategoryRequest(raw: unknown): SaveCategoryRequest | string {
  if (!isRecord(raw)) return 'Fill in the category and try again.';
  const id = readOptionalId(raw['id']);
  if (id === false) return 'This category could not be read. Reload the page.';
  const name = readName(raw['name']);
  if (typeof name !== 'string' || name.length === 0) return 'Enter a name for the category.';
  if (name.length > MAX_CATALOG_NAME) return `Keep the name to ${MAX_CATALOG_NAME} characters or fewer.`;
  if (id === null && !hasEnglishLetterOrDigit(name)) return ENGLISH_NAME_MESSAGE;
  const parentId = readOptionalId(raw['parentId']);
  if (parentId === false) return 'The parent category could not be read. Reload the page.';
  const description = raw['description'] ?? '';
  if (typeof description !== 'string') return 'The description could not be read.';
  const trimmedDescription = description.trim();
  if (trimmedDescription.length > MAX_CATEGORY_DESCRIPTION) {
    return `Keep the description to ${MAX_CATEGORY_DESCRIPTION} characters or fewer.`;
  }
  const image = readImage(raw['image'], 'categories/');
  if (typeof image === 'string') return image;
  const weight = readWeight(raw['defaultWeightGrams']);
  if (typeof weight === 'string') return weight;
  const shopLabel = readShopLabel(raw['shopLabel']);
  if (shopLabel === false) return 'The name on Shop tabs could not be read.';
  if (shopLabel !== undefined && shopLabel.length > MAX_SHOP_LABEL) {
    return `Keep the name on Shop tabs to ${MAX_SHOP_LABEL} characters or fewer.`;
  }
  const sizeChart = readChoice(raw['sizeChart'], CATEGORY_SIZE_CHARTS);
  if (sizeChart === false) return 'Choose a size chart, or the same as the parent.';
  const detailsTitle = readChoice(raw['detailsTitle'], CATEGORY_DETAILS_TITLES);
  if (detailsTitle === false) return 'Choose a details title, or the same as the parent.';
  if (typeof raw['published'] !== 'boolean') return 'Choose whether shoppers can see this category.';
  return {
    id,
    name,
    parentId,
    description: trimmedDescription,
    image,
    defaultWeightGrams: weight.value,
    ...(shopLabel !== undefined ? { shopLabel } : {}),
    ...(sizeChart !== undefined ? { sizeChart } : {}),
    ...(detailsTitle !== undefined ? { detailsTitle } : {}),
    published: raw['published'],
  };
}

export function readSaveBrandRequest(raw: unknown): SaveBrandRequest | string {
  if (!isRecord(raw)) return 'Fill in the brand and try again.';
  const id = readOptionalId(raw['id']);
  if (id === false) return 'This brand could not be read. Reload the page.';
  const name = readName(raw['name']);
  if (typeof name !== 'string' || name.length === 0) return 'Enter a name for the brand.';
  if (name.length > MAX_CATALOG_NAME) return `Keep the name to ${MAX_CATALOG_NAME} characters or fewer.`;
  if (id === null && !hasEnglishLetterOrDigit(name)) return ENGLISH_NAME_MESSAGE;
  const logo = readImage(raw['logo'], 'brands/');
  if (typeof logo === 'string') return logo;
  if (typeof raw['published'] !== 'boolean') return 'Choose whether shoppers can see this brand.';
  return { id, name, logo, published: raw['published'] };
}

export function readDeleteRequest(raw: unknown): DeleteRequest | string {
  if (!isRecord(raw)) return 'Choose what to delete and try again.';
  const id = readOptionalId(raw['id']);
  if (id === false || id === null) return 'Choose what to delete and try again.';
  return { id, check: raw['check'] === true };
}

export function readReorderRequest(raw: unknown): ReorderRequest | string {
  if (!isRecord(raw)) return 'The new order could not be read. Reload the page.';
  const kind = raw['kind'];
  if (kind !== 'categories' && kind !== 'brands') return 'The new order could not be read. Reload the page.';
  const ids = raw['ids'];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REORDER) {
    return 'The new order could not be read. Reload the page.';
  }
  const out: string[] = [];
  for (const value of ids) {
    const id = readOptionalId(value);
    if (id === false || id === null || out.includes(id)) {
      return 'The new order could not be read. Reload the page.';
    }
    out.push(id);
  }
  return { kind, ids: out };
}

/** `sortOrder` for each position in a level: 10, 20, 30… (the seed spacing). */
export function sortOrderFor(index: number): number {
  return (index + 1) * 10;
}

/** A Firestore document id we write: lowercase link-name characters only. */
export function isCatalogId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

function readOptionalId(value: unknown): string | null | false {
  if (value === null || value === undefined || value === '') return null;
  return isCatalogId(value) ? value : false;
}

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/\s+/g, ' ').trim();
}

function readImage(value: unknown, folder: 'categories/' | 'brands/'): CatalogImage | null | string {
  if (value === null || value === undefined) return null;
  const message = 'The photo could not be read. Upload it again.';
  if (!isRecord(value)) return message;
  const path = value['path'];
  if (typeof path !== 'string') return message;
  const trimmedPath = path.trim();
  if (
    !trimmedPath.startsWith(folder) ||
    trimmedPath.length > 300 ||
    trimmedPath.includes('..') ||
    trimmedPath.includes('//')
  ) {
    return message;
  }
  const alt = typeof value['alt'] === 'string' ? value['alt'].trim() : '';
  if (alt.length === 0) return 'Describe the photo in a few words.';
  if (alt.length > MAX_IMAGE_ALT)
    return `Keep the photo description to ${MAX_IMAGE_ALT} characters or fewer.`;
  const width = readDimension(value['width']);
  const height = readDimension(value['height']);
  return {
    path: trimmedPath,
    alt,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function readDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 20_000
    ? value
    : undefined;
}

/** undefined = not sent, false = not text, else the tidied label ('' = none). */
function readShopLabel(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (typeof value !== 'string') return false;
  return value.replace(/\s+/g, ' ').trim();
}

/** undefined = not sent, null = same as the parent, false = not one of the choices. */
function readChoice<T extends string>(value: unknown, choices: readonly T[]): T | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : false;
}

function readWeight(value: unknown): { readonly value: number | null | undefined } | string {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_WEIGHT_GRAMS) {
    return { value };
  }
  return 'Weights are whole grams from 0 to 100,000, or left empty.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
