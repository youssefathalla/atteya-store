/**
 * Pure rules for the admin Categories & Brands screen (ATS-245): reading the callable
 * requests and working out a new category's or brand's id, slug and place in the tree.
 * Tested in catalog-admin.test.ts. The callables live in catalog-admin.fn.ts.
 */
import { SEED_BRANDS, SEED_CATEGORIES } from './catalog-taxonomy.js';
import { kebabSlug, nextSlug } from './slug.js';

export const MAX_CATALOG_NAME = 60;
export const MAX_CATEGORY_DESCRIPTION = 500;
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

/** Why a category can't be deleted, or null when it can. */
export function categoryDeleteBlockedReason(
  id: string,
  usage: { readonly products: number; readonly subCategories: number },
): string | null {
  if (SEED_CATEGORY_IDS.has(id)) {
    return 'This is one of the store’s built-in categories. You can hide it instead.';
  }
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

/** Why a brand can't be deleted, or null when it can. */
export function brandDeleteBlockedReason(id: string, products: number): string | null {
  if (SEED_BRAND_IDS.has(id)) {
    return 'This is one of the store’s built-in brands. You can hide it instead.';
  }
  if (products > 0) {
    return products === 1
      ? '1 product uses this brand. Change its brand first, or hide it instead.'
      : `${products} products use this brand. Change their brand first, or hide it instead.`;
  }
  return null;
}

export function readSaveCategoryRequest(raw: unknown): SaveCategoryRequest | string {
  if (!isRecord(raw)) return 'Fill in the category and try again.';
  const id = readOptionalId(raw['id']);
  if (id === false) return 'This category could not be read. Reload the page.';
  const name = readName(raw['name']);
  if (typeof name !== 'string' || name.length === 0) return 'Enter a name for the category.';
  if (name.length > MAX_CATALOG_NAME) return `Keep the name to ${MAX_CATALOG_NAME} characters or fewer.`;
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
  if (typeof raw['published'] !== 'boolean') return 'Choose whether shoppers can see this category.';
  return {
    id,
    name,
    parentId,
    description: trimmedDescription,
    image,
    defaultWeightGrams: weight.value,
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
  const logo = readImage(raw['logo'], 'brands/');
  if (typeof logo === 'string') return logo;
  if (typeof raw['published'] !== 'boolean') return 'Choose whether shoppers can see this brand.';
  return { id, name, logo, published: raw['published'] };
}

export function readDeleteRequest(raw: unknown): DeleteRequest | string {
  if (!isRecord(raw)) return 'Choose what to delete and try again.';
  const id = readOptionalId(raw['id']);
  if (id === false || id === null) return 'Choose what to delete and try again.';
  return { id };
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
