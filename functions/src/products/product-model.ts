import { HttpsError } from 'firebase-functions/v2/https';
import type { ProductTypeId } from './catalog-mapping.js';
import { COLOR_PALETTE, type ColorId } from './catalog-taxonomy.js';
import type { MarketingBadge } from './marketing-badge.js';
import {
  invalid,
  isIntegerInRange,
  isPlainObject,
  kebab,
  readColors,
  readCompareAtPrice,
  readCreateId,
  readDescription,
  readDetails,
  readGender,
  readImages,
  readMarketingBadge,
  readName,
  readNewArrivalUntil,
  readPlayers,
  readPrice,
  readPublished,
  readSizes,
  readSlugId,
  readSummary,
  readTags,
  readType,
  readUpdateId,
  readWeightGrams,
  type ProductGenderId,
  type ProductImageInput,
  type StoredOptionLike,
  type StoredOptionValueLike,
} from './product-form.js';
import { nextSlug } from './slug.js';

/** A product has at most this many colours (one product document each). */
export const MAX_MODEL_COLOURS = 12;
/** Same limit as `modelGroup` in `ProductSchema` and the slug rules. */
export const MAX_MODEL_GROUP = 80;
const MAX_COUNT = 100_000;
const MAX_OPTIONS = 8;
const VERSION_PATTERN = /^\d{1,12}\.\d{9}$/;

/** Shown when a colour changed (or a colour joined the product) after the page loaded it. */
export const MODEL_CHANGED_MESSAGE = 'Someone changed this product while you were editing. Reload to see it.';

export interface ModelSizeInput {
  /** The saved size id this row came from; missing = a new size. */
  readonly id?: string;
  readonly label: string;
}

/** Details shared by every colour of a product. */
export interface ModelSharedInput {
  readonly name: string;
  readonly summary: string | null;
  /** Missing = every saved colour keeps its own description; new colours copy the first saved one. */
  readonly description?: string | null;
  readonly details: readonly string[];
  readonly type: ProductTypeId;
  readonly categoryId: string;
  readonly brandId: string;
  readonly gender: ProductGenderId | null;
  /** Missing = every saved colour keeps its players; new colours copy the first saved one. */
  readonly players?: readonly string[];
  readonly weightGrams: number | null;
  readonly tags: readonly string[];
  readonly marketingBadge: MarketingBadge | null;
  readonly newArrivalUntil: Date | null;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly sizes: readonly ModelSizeInput[];
}

export interface ModelColourInput {
  readonly productId: string;
  /** `updateTime` of the document when the page loaded it (`versionOf`); null = a new colour. */
  readonly version: string | null;
  /** The colour first; extra palette ids (an accent colour) stay as they were saved. */
  readonly colors: readonly ColorId[];
  readonly images: readonly ProductImageInput[];
  readonly published: boolean;
  /** This colour's own price; null = the shared price. */
  readonly ownPrice: { readonly price: number; readonly compareAtPrice: number | null } | null;
  /** Stock per shared size (same order); with no sizes, one number for the whole colour. */
  readonly stock: readonly number[];
  /** Per shared size: false = this colour isn't made in that size. Empty with no sizes. */
  readonly made: readonly boolean[];
}

export interface SaveProductModelRequest {
  /** The product the page opened; null when creating a new product. */
  readonly anchorId: string | null;
  readonly shared: ModelSharedInput;
  readonly colours: readonly ModelColourInput[];
}

export interface ModelColourVersion {
  readonly id: string;
  readonly version: string;
}

export interface ProductModelResponse {
  readonly modelGroup: string | null;
  readonly colours: readonly ModelColourVersion[];
}

export interface SaveProductModelResponse {
  readonly anchorId: string;
  readonly modelGroup: string | null;
  readonly colours: readonly { readonly id: string; readonly slug: string }[];
}

export function parseProductModelRequest(raw: unknown): { productId: string } {
  if (!isPlainObject(raw)) invalid('Choose a product and try again.');
  return { productId: readUpdateId(raw['productId']) };
}

export function parseSaveProductModelRequest(raw: unknown): SaveProductModelRequest {
  if (!isPlainObject(raw)) invalid('Send the product details.');
  const anchorRaw = raw['anchorId'];
  const anchorId = anchorRaw === null || anchorRaw === undefined ? null : readUpdateId(anchorRaw);
  const shared = readShared(raw['shared']);
  const colours = readColours(raw['colours'], shared.sizes.length, anchorId === null);
  if (anchorId !== null && !colours.some((colour) => colour.productId === anchorId)) {
    invalid('Reload the page and try again.');
  }
  return { anchorId, shared, colours };
}

/** A Firestore `updateTime` as an exact string: seconds, a dot, then nanoseconds (9 digits). */
export function versionOf(time: { readonly seconds: number; readonly nanoseconds: number }): string {
  return `${time.seconds}.${String(time.nanoseconds).padStart(9, '0')}`;
}

/** Same rule as `functions/scripts/link-colour-models.mjs`: folded name, dashes, at most 80 characters. */
export function modelGroupFromName(name: string): string {
  const folded = name
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = folded.slice(0, MAX_MODEL_GROUP).replace(/-+$/g, '');
  return cut.length > 0 ? cut : 'product';
}

/**
 * Web address base for a new colour: the name, plus the colour when the product has more than one
 * colour (`bullpadel-padel-shorts-green`), like `clean-product-slugs.mjs`.
 */
export function colourSlugBase(name: string, color: ColorId, withColour: boolean): string {
  const label = COLOR_PALETTE.find((entry) => entry.id === color)?.label ?? color;
  const base = kebab(withColour ? `${name} ${label}` : name) || 'product';
  return base.slice(0, MAX_MODEL_GROUP).replace(/-+$/g, '');
}

/**
 * One id per shared size: a saved id stays, a new size gets its kebab label, deduped. The same id is
 * used by every colour, so `stockBySize`, bag lines and offer size rules keep matching.
 */
export function sharedSizeIds(sizes: readonly ModelSizeInput[]): string[] {
  const taken = new Set<string>();
  const ids: (string | null)[] = sizes.map((size) => {
    if (size.id === undefined) return null;
    if (taken.has(size.id)) invalid("One of the sizes isn't valid. Reload the page.");
    taken.add(size.id);
    return size.id;
  });
  return ids.map((id, index) => {
    if (id !== null) return id;
    const next = nextSlug(kebab(sizes[index]?.label ?? '') || 'size', taken);
    taken.add(next);
    return next;
  });
}

export interface ColourSizes {
  /** The colour's options with its size option rebuilt (other options kept). */
  readonly options: StoredOptionLike[];
  /** Stock per size id the colour is made in; null when the product has no sizes. */
  readonly stockBySize: Record<string, number> | null;
  /** Total stock when the product has no sizes. */
  readonly flatStock: number;
}

/**
 * Rebuild one colour's size option from the shared sizes. A saved size keeps its id; a size this
 * colour already had under another id (matched by name) keeps that id, so its bag lines still match.
 * Sizes marked not made are left out of this colour only.
 */
export function colourSizes(
  liveOptions: unknown,
  sizes: readonly ModelSizeInput[],
  ids: readonly string[],
  colour: Pick<ModelColourInput, 'stock' | 'made'>,
): ColourSizes {
  const list = Array.isArray(liveOptions) ? liveOptions : [];
  const live = list.find((entry) => isPlainObject(entry) && entry['key'] === 'size');
  const liveValues: Record<string, unknown>[] =
    isPlainObject(live) && Array.isArray(live['values']) ? live['values'].filter(isPlainObject) : [];
  const label =
    isPlainObject(live) && typeof live['label'] === 'string' && live['label'] ? live['label'] : 'Size';

  const values: StoredOptionValueLike[] = [];
  const stockBySize: Record<string, number> = {};
  const used = new Set<string>();
  sizes.forEach((size, index) => {
    const canonical = ids[index];
    if (canonical === undefined || colour.made[index] !== true) return;
    const byId = liveValues.find((value) => value['id'] === canonical);
    const byLabel = liveValues.find(
      (value) =>
        typeof value['id'] === 'string' &&
        typeof value['label'] === 'string' &&
        value['label'].trim().toLowerCase() === size.label.toLowerCase() &&
        !ids.includes(value['id']),
    );
    const previous = byId ?? byLabel;
    const previousId = previous?.['id'];
    const id = typeof previousId === 'string' && !used.has(previousId) ? previousId : canonical;
    if (used.has(id)) invalid("One of the sizes isn't valid. Reload the page.");
    used.add(id);
    values.push({ ...(previous ?? {}), id, label: size.label } as StoredOptionValueLike);
    stockBySize[id] = colour.stock[index] ?? 0;
  });

  const options: StoredOptionLike[] = [];
  let inserted = false;
  for (const entry of list) {
    if (!isPlainObject(entry)) invalid("This product's options can't be saved. Reload the page.");
    if (entry['key'] === 'size') {
      if (!inserted && values.length > 0) options.push({ key: 'size', label, values });
      inserted = true;
      continue;
    }
    options.push({ ...entry } as unknown as StoredOptionLike);
  }
  if (!inserted && values.length > 0) options.push({ key: 'size', label, values });
  if (options.length > MAX_OPTIONS) invalid('A product can have up to 8 options.');

  return sizes.length > 0
    ? { options, stockBySize, flatStock: 0 }
    : { options, stockBySize: null, flatStock: colour.stock[0] ?? 0 };
}

function readShared(raw: unknown): ModelSharedInput {
  if (!isPlainObject(raw)) invalid('Send the product details.');
  const price = readPrice(raw['price']);
  const sizes = readSizes(raw['sizes']).map((size) =>
    size.id === undefined ? { label: size.label } : { id: size.id, label: size.label },
  );
  const description = readDescription(raw);
  const players = readPlayers(raw);
  const weight = readWeightGrams(raw);
  const shared: ModelSharedInput = {
    name: readName(raw['name']),
    summary: readSummary(raw['summary']),
    details: readDetails(raw) ?? [],
    type: readType(raw['type']),
    categoryId: readSlugId(raw['categoryId'], 'Choose a category.'),
    brandId: readSlugId(raw['brandId'], 'Choose a brand.'),
    gender: readGender(raw['gender']),
    weightGrams: weight ?? null,
    tags: readTags(raw['tags']),
    marketingBadge: readMarketingBadge(raw['marketingBadge']),
    newArrivalUntil: readNewArrivalUntil(raw['newArrivalUntil']),
    price,
    compareAtPrice: readCompareAtPrice(raw['compareAtPrice'], price),
    sizes,
  };
  const withDescription = description === undefined ? shared : { ...shared, description };
  return players === undefined ? withDescription : { ...withDescription, players };
}

function readColours(raw: unknown, sizeCount: number, creating: boolean): ModelColourInput[] {
  if (!Array.isArray(raw) || raw.length === 0) invalid('Add at least one colour.');
  if (raw.length > MAX_MODEL_COLOURS) invalid('A product can have up to 12 colours.');
  const colours = raw.map((entry) => readColour(entry, sizeCount, creating));
  const ids = new Set(colours.map((colour) => colour.productId));
  if (ids.size !== colours.length) invalid('Reload the page and try again.');
  const firsts = new Set(colours.map((colour) => colour.colors.join('+')));
  if (firsts.size !== colours.length) invalid('Each colour can only be added once.');
  return colours;
}

function readColour(raw: unknown, sizeCount: number, creating: boolean): ModelColourInput {
  if (!isPlainObject(raw)) invalid('Send the colours again.');
  const version = readVersion(raw['version']);
  if (creating && version !== null) invalid('Reload the page and try again.');
  const productId = version === null ? readCreateId(raw['productId']) : readUpdateId(raw['productId']);
  const colors = readColors(raw['colors']);
  if (colors.length === 0) invalid('Choose a colour.');
  const images = readImages(raw['images']);
  const published = readPublished(raw['published'], images.length);
  const ownPrice = readOwnPrice(raw['ownPrice']);
  const made = readMade(raw['made'], sizeCount);
  const stock = readStockList(raw['stock'], sizeCount);
  if (sizeCount > 0 && !made.some(Boolean)) {
    invalid('Each colour needs at least one size it is made in.');
  }
  return { productId, version, colors, images, published, ownPrice, stock, made };
}

function readVersion(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    invalid('Reload the page and try again.');
  }
  return value;
}

function readOwnPrice(value: unknown): ModelColourInput['ownPrice'] {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) invalid('Enter a price in whole pounds.');
  const price = readPrice(value['price']);
  return { price, compareAtPrice: readCompareAtPrice(value['compareAtPrice'], price) };
}

function readMade(value: unknown, sizeCount: number): boolean[] {
  if (!Array.isArray(value) || value.length !== sizeCount) invalid('Reload the page and try again.');
  return value.map((entry) => {
    if (typeof entry !== 'boolean') invalid('Reload the page and try again.');
    return entry;
  });
}

function readStockList(value: unknown, sizeCount: number): number[] {
  const expected = sizeCount > 0 ? sizeCount : 1;
  if (!Array.isArray(value) || value.length !== expected) invalid('Reload the page and try again.');
  return value.map((entry) => {
    if (!isIntegerInRange(entry, 0, MAX_COUNT)) {
      invalid('Stock must be a whole number from 0 to 100,000.');
    }
    return entry;
  });
}

/** Thrown when a colour changed after the page loaded it. */
export function modelChanged(): never {
  throw new HttpsError('aborted', MODEL_CHANGED_MESSAGE);
}
