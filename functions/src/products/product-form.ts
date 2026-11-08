import { HttpsError } from 'firebase-functions/v2/https';
import { collapseSpaces, PRODUCT_TYPES, type ProductTypeId } from './catalog-mapping.js';
import { COLOR_IDS, type ColorId } from './catalog-taxonomy.js';
import {
  isMarketingBadgeKind,
  isMarketingBadgeStyle,
  type MarketingBadge,
} from './marketing-badge.js';
import { nextSlug } from './slug.js';

const CREATE_ID = /^[A-Za-z0-9]{20}$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TAG_PATTERN = /^[a-z0-9-]{1,32}$/;
const MAX_NAME = 200;
const MAX_SUMMARY = 300;
const MAX_DESCRIPTION = 5_000;
/** Details list: one fact per line (materials, racket specs). */
export const MAX_DETAIL_LINES = 20;
export const MAX_DETAIL_LINE = 200;
const MAX_SLUG = 80;
const MIN_SLUG = 3;
const MAX_ID = 80;
const MAX_PRICE = 1_000_000;
const MAX_IMAGES = 8;
const MAX_ALT = 125;
const MAX_PATH = 300;
const MAX_COLORS = 12;
const MAX_TAGS = 20;
const MAX_SIZES = 20;
const MAX_SIZE_LABEL = 20;
const MAX_SIZE_ID = 100;
const MAX_COUNT = 100_000;
const MAX_WEIGHT_GRAMS = 100_000;
const MAX_OPTIONS = 8;

const TYPE_IDS = new Set<string>(PRODUCT_TYPES.map((type) => type.id));
const COLOR_ID_SET = new Set<string>(COLOR_IDS);
export const PRODUCT_GENDER_IDS = ['women', 'men', 'kids', 'unisex'] as const;
export type ProductGenderId = (typeof PRODUCT_GENDER_IDS)[number];
const GENDER_ID_SET = new Set<string>(PRODUCT_GENDER_IDS);

export interface ProductSizeInput {
  readonly id?: string;
  readonly label: string;
  readonly initialStock?: number;
}

export interface ProductImageInput {
  readonly path: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ProductFormInput {
  readonly name: string;
  readonly summary: string | null;
  readonly description?: string | null;
  /** One fact per line. Missing = leave the saved list as it is. */
  readonly details?: readonly string[];
  readonly type: ProductTypeId;
  readonly categoryId: string;
  readonly brandId: string;
  readonly modelGroup: string | null;
  readonly gender: ProductGenderId | null;
  readonly colors: readonly ColorId[];
  readonly tags: readonly string[];
  readonly marketingBadge: MarketingBadge | null;
  /** End of New Arrivals window, or null when not flagged. */
  readonly newArrivalUntil: Date | null;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly published: boolean;
  readonly images: readonly ProductImageInput[];
  readonly sizes: readonly ProductSizeInput[];
  readonly stock?: number;
  readonly weightGrams?: number | null;
}

export interface CreateProductRequest extends ProductFormInput {
  readonly productId: string;
  readonly slug?: string;
}

export interface UpdateProductRequest extends ProductFormInput {
  readonly productId: string;
}

export interface SaveProductResponse {
  readonly id: string;
  readonly slug: string;
}

export interface StoredOptionValueLike {
  readonly id: string;
  readonly label: string;
  readonly swatch?: string;
  readonly color?: string;
  readonly image?: unknown;
}

export interface StoredOptionLike {
  readonly key: string;
  readonly label: string;
  readonly values: readonly StoredOptionValueLike[];
}

export function parseCreateProductRequest(raw: unknown): CreateProductRequest {
  const body = plain(raw);
  const productId = readCreateId(body['productId']);
  const slug = readOptionalSlug(body['slug']);
  const form = parseForm(body);
  return slug === undefined ? { ...form, productId } : { ...form, productId, slug };
}

export function parseUpdateProductRequest(raw: unknown): UpdateProductRequest {
  const body = plain(raw);
  return { ...parseForm(body), productId: readUpdateId(body['productId']) };
}

/** Escape plain text and wrap blank-line paragraphs. Null or empty stays null. */
export function descriptionToHtml(text: string | null): string | null {
  if (text === null) return null;
  const normalised = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (normalised.length === 0) return null;

  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (const line of normalised.split('\n')) {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(line.trim());
  }
  if (current.length > 0) paragraphs.push(current);
  if (paragraphs.length === 0) return null;

  return paragraphs
    .map((lines) => `<p>${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`)
    .join('');
}

/**
 * Rebuild the size option in place. Other options stay as they are.
 * New ids are kebab labels, deduped inside the option, falling back to `size`.
 */
export function nextSizeOption(
  live: unknown,
  sizes: readonly ProductSizeInput[],
): { options: StoredOptionLike[]; sizeIds: string[]; newIds: string[] } {
  const list = Array.isArray(live) ? live : [];
  const built = sizes.length > 0 ? buildSizeOption(list, sizes) : null;
  const options: StoredOptionLike[] = [];
  let inserted = false;

  for (const entry of list) {
    if (!isPlainObject(entry)) {
      invalid("This product's options can't be saved. Reload the page.");
    }
    if (entry['key'] === 'size') {
      if (!inserted && built) {
        options.push(built.option);
        inserted = true;
      }
      continue;
    }
    options.push({ ...entry } as unknown as StoredOptionLike);
  }

  if (!inserted && built) options.push(built.option);
  if (options.length > MAX_OPTIONS) invalid('A product can have up to 8 options.');

  return {
    options,
    sizeIds: built?.sizeIds ?? [],
    newIds: built?.newIds ?? [],
  };
}

function parseForm(raw: Record<string, unknown>): ProductFormInput {
  const images = readImages(raw['images']);
  const sizes = readSizes(raw['sizes']);
  const price = readPrice(raw['price']);
  const form: ProductFormInput = {
    name: readName(raw['name']),
    summary: readSummary(raw['summary']),
    description: readDescription(raw),
    type: readType(raw['type']),
    categoryId: readSlugId(raw['categoryId'], 'Choose a category.'),
    brandId: readSlugId(raw['brandId'], 'Choose a brand.'),
    modelGroup: readModelGroup(raw['modelGroup']),
    gender: readGender(raw['gender']),
    colors: readColors(raw['colors']),
    tags: readTags(raw['tags']),
    marketingBadge: readMarketingBadge(raw['marketingBadge']),
    newArrivalUntil: readNewArrivalUntil(raw['newArrivalUntil']),
    price,
    compareAtPrice: readCompareAtPrice(raw['compareAtPrice'], price),
    published: readPublished(raw['published'], images.length),
    images,
    sizes,
  };
  const stock = readStock(raw, sizes.length);
  const weightGrams = readWeightGrams(raw);
  const details = readDetails(raw);
  const withDetails = details === undefined ? form : { ...form, details };
  const withStock = stock === undefined ? withDetails : { ...withDetails, stock };
  return weightGrams === undefined ? withStock : { ...withStock, weightGrams };
}

function buildSizeOption(
  list: readonly unknown[],
  sizes: readonly ProductSizeInput[],
): { option: StoredOptionLike; sizeIds: string[]; newIds: string[] } {
  const live = firstSizeOption(list);
  const liveById = liveValueMap(live);
  const label =
    live && typeof live['label'] === 'string' && live['label'].length > 0 ? live['label'] : 'Size';
  const taken = new Set<string>();
  const values: StoredOptionValueLike[] = [];
  const sizeIds: string[] = [];
  const newIds: string[] = [];

  for (const size of sizes) {
    const requested = size.id;
    if (requested !== undefined && liveById.has(requested) && !taken.has(requested)) {
      taken.add(requested);
      sizeIds.push(requested);
      const previous = liveById.get(requested);
      values.push({ ...previous, id: requested, label: size.label } as StoredOptionValueLike);
      continue;
    }
    const id = nextSlug(kebab(size.label) || 'size', taken);
    taken.add(id);
    sizeIds.push(id);
    // No id means the form treated this row as new, even when the kebab matches a live value.
    if (requested === undefined || !liveById.has(id)) newIds.push(id);
    values.push({ id, label: size.label });
  }

  return { option: { key: 'size', label, values }, sizeIds, newIds };
}

function firstSizeOption(list: readonly unknown[]): Record<string, unknown> | null {
  for (const entry of list) {
    if (isPlainObject(entry) && entry['key'] === 'size') return entry;
  }
  return null;
}

function liveValueMap(option: Record<string, unknown> | null): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!option || !Array.isArray(option['values'])) return map;
  for (const value of option['values']) {
    if (!isPlainObject(value)) continue;
    const id = value['id'];
    if (typeof id !== 'string' || id.length === 0 || map.has(id)) continue;
    map.set(id, value);
  }
  return map;
}

function readCreateId(value: unknown): string {
  if (typeof value !== 'string' || !CREATE_ID.test(value)) {
    invalid('Start again from Add product.');
  }
  return value;
}

function readUpdateId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 200 ||
    value.includes('/')
  ) {
    invalid('Choose a product and try again.');
  }
  return value;
}

function readName(value: unknown): string {
  if (typeof value !== 'string') invalid('Give the product a name.');
  const name = collapseSpaces(value);
  if (name.length === 0) invalid('Give the product a name.');
  if (name.length > MAX_NAME) invalid('The name must be 200 characters or fewer.');
  return name;
}

function readOptionalSlug(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    invalid('Use lowercase letters, numbers and dashes for the web address.');
  }
  const slug = value.trim();
  if (slug.length === 0) return undefined;
  if (slug.length < MIN_SLUG || slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) {
    invalid('Use lowercase letters, numbers and dashes for the web address.');
  }
  return slug;
}

function readSummary(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid('The summary must be plain text.');
  const summary = value.trim();
  if (summary.length === 0) return null;
  if (summary.length > MAX_SUMMARY) invalid('The summary must be 300 characters or fewer.');
  return summary;
}

function readDescription(raw: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(raw, 'description')) return undefined;
  const value = raw['description'];
  if (value === null) return null;
  if (typeof value !== 'string') invalid('The description must be plain text.');
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION) {
    invalid('The description must be 5,000 characters or fewer.');
  }
  return description.length === 0 ? null : description;
}

/**
 * Details lines: trimmed, blanks dropped, a leading "•" removed (pasted bullet lists).
 * Missing key = undefined (the saved list stays); null = clear.
 */
function readDetails(raw: Record<string, unknown>): string[] | undefined {
  if (!Object.hasOwn(raw, 'details')) return undefined;
  const value = raw['details'];
  if (value === null) return [];
  if (!Array.isArray(value)) invalid('Write the details as a list, one per line.');
  const lines: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') invalid('Write the details as a list, one per line.');
    const line = detailLine(entry);
    if (line.length === 0) continue;
    if (line.length > MAX_DETAIL_LINE) {
      invalid('Keep each line of details to 200 characters or fewer.');
    }
    lines.push(line);
  }
  if (lines.length > MAX_DETAIL_LINES) invalid('Add up to 20 lines of details.');
  return lines;
}

/** One details line without a leading bullet and with single spaces. */
export function detailLine(value: string): string {
  return collapseSpaces(value.trim().replace(/^•\s*/u, ''));
}

function readType(value: unknown): ProductTypeId {
  if (typeof value !== 'string' || !TYPE_IDS.has(value)) invalid('Choose a product type.');
  return value as ProductTypeId;
}

function readSlugId(value: unknown, message: string): string {
  if (typeof value !== 'string') invalid(message);
  const id = value.trim();
  if (id.length === 0 || id.length > MAX_ID || !SLUG_PATTERN.test(id)) invalid(message);
  return id;
}

function readModelGroup(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    invalid('Use lowercase letters, numbers and dashes for the model group.');
  }
  const group = value.trim();
  if (group.length === 0) return null;
  if (group.length > MAX_SLUG || !isModelGroup(group)) {
    invalid('Use lowercase letters, numbers and dashes for the model group.');
  }
  return group;
}

function readGender(value: unknown): ProductGenderId | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    invalid('Choose Women, Men, Kids, or Unisex — or leave gender unset.');
  }
  const gender = value.trim();
  if (gender.length === 0) return null;
  if (!GENDER_ID_SET.has(gender)) {
    invalid('Choose Women, Men, Kids, or Unisex — or leave gender unset.');
  }
  return gender as ProductGenderId;
}

function isModelGroup(value: string): boolean {
  return value.split('-').every((part) => part.length > 0 && isSlugPart(part));
}

function isSlugPart(part: string): boolean {
  for (const char of part) {
    const code = char.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const letter = code >= 97 && code <= 122;
    if (!digit && !letter) return false;
  }
  return true;
}

function readColors(value: unknown): ColorId[] {
  if (!Array.isArray(value)) invalid('Choose colours from the list.');
  if (value.length > MAX_COLORS) invalid('Choose up to 12 colours.');
  const colors: ColorId[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !COLOR_ID_SET.has(entry)) {
      invalid('Choose colours from the list.');
    }
    if (seen.has(entry)) invalid('Each colour can only be chosen once.');
    seen.add(entry);
    colors.push(entry as ColorId);
  }
  return colors;
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) invalid('Tags use lowercase letters, numbers and dashes.');
  if (value.length > MAX_TAGS) invalid('You can add up to 20 tags.');
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') invalid('Tags use lowercase letters, numbers and dashes.');
    const tag = entry.trim();
    if (!TAG_PATTERN.test(tag)) invalid('Tags use lowercase letters, numbers and dashes.');
    if (seen.has(tag)) invalid('Each tag can only be added once.');
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function readMarketingBadge(value: unknown): MarketingBadge | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    invalid('Choose a marketing badge or leave it empty.');
  }
  const kind = value['kind'];
  const style = value['style'];
  if (typeof kind !== 'string' || !isMarketingBadgeKind(kind)) {
    invalid('Choose NEW, BESTSELLER, or LIMITED EDITION.');
  }
  if (typeof style !== 'string' || !isMarketingBadgeStyle(style)) {
    invalid('Choose a plain or boxed badge style.');
  }
  return { kind, style };
}

/**
 * Accepts null (clear), ISO string, or epoch milliseconds.
 * Must be a real future-or-present instant when set (admin may extend).
 */
function readNewArrivalUntil(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      invalid('Choose a valid New arrival end date.');
    }
    return new Date(value);
  }
  if (typeof value !== 'string') {
    invalid('Choose a valid New arrival end date.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    invalid('Choose a valid New arrival end date.');
  }
  return new Date(ms);
}

function readPrice(value: unknown): number {
  if (!isIntegerInRange(value, 1, MAX_PRICE)) invalid('Enter a price in whole pounds.');
  return value;
}

function readCompareAtPrice(value: unknown, price: number): number | null {
  if (value === undefined || value === null) return null;
  if (!isIntegerInRange(value, 1, MAX_PRICE) || value <= price) {
    invalid('The original price must be higher than the selling price.');
  }
  return value;
}

function readPublished(value: unknown, imageCount: number): boolean {
  if (typeof value !== 'boolean') invalid('Choose whether to show this product on the store.');
  if (value && imageCount < 1) {
    invalid('Add at least one photo before showing it on the store.');
  }
  return value;
}

function readImages(value: unknown): ProductImageInput[] {
  if (!Array.isArray(value)) invalid('Add the product photos again.');
  if (value.length > MAX_IMAGES) invalid('Add up to 8 photos.');
  return value.map((entry) => readImage(entry));
}

function readImage(value: unknown): ProductImageInput {
  if (!isPlainObject(value)) invalid('Add the product photos again.');
  const path = value['path'];
  if (typeof path !== 'string' || !isSafeProductPath(path)) {
    invalid("One of the photos can't be saved. Remove it and add it again.");
  }
  const altRaw = value['alt'];
  if (typeof altRaw !== 'string') invalid('Describe each photo.');
  const alt = altRaw.trim();
  if (alt.length < 1 || alt.length > MAX_ALT) {
    invalid('Describe each photo in 125 characters or fewer.');
  }
  const image: { path: string; alt: string; width?: number; height?: number } = { path, alt };
  const width = readDimension(value['width']);
  const height = readDimension(value['height']);
  if (width !== undefined) image.width = width;
  if (height !== undefined) image.height = height;
  return image;
}

function isSafeProductPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH &&
    path.startsWith('products/') &&
    !path.startsWith('/') &&
    !path.includes('..') &&
    !path.includes('://')
  );
}

function readDimension(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!isIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER)) {
    invalid('Photo width and height must be whole numbers.');
  }
  return value;
}

function readSizes(value: unknown): ProductSizeInput[] {
  if (!Array.isArray(value)) invalid('Add sizes as a list.');
  if (value.length > MAX_SIZES) invalid('You can add up to 20 sizes.');
  const sizes: ProductSizeInput[] = [];
  const labels = new Set<string>();
  for (const entry of value) sizes.push(readSize(entry, labels));
  return sizes;
}

function readSize(value: unknown, labels: Set<string>): ProductSizeInput {
  if (!isPlainObject(value)) invalid('Each size needs a name.');
  const labelRaw = value['label'];
  if (typeof labelRaw !== 'string') invalid('Each size needs a name.');
  const label = labelRaw.trim();
  if (label.length < 1 || label.length > MAX_SIZE_LABEL) {
    invalid('Each size needs a name of 20 characters or fewer.');
  }
  const key = label.toLowerCase();
  if (labels.has(key)) invalid('This size is already in the list.');
  labels.add(key);

  const size: { id?: string; label: string; initialStock?: number } = { label };
  if (Object.hasOwn(value, 'id') && value['id'] !== undefined) {
    const id = value['id'];
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_SIZE_ID) {
      invalid("One of the sizes isn't valid. Reload the page.");
    }
    size.id = id;
  }
  if (Object.hasOwn(value, 'initialStock') && value['initialStock'] !== undefined) {
    if (!isIntegerInRange(value['initialStock'], 0, MAX_COUNT)) {
      invalid('Starting stock must be a whole number from 0 to 100,000.');
    }
    size.initialStock = value['initialStock'];
  }
  return size;
}

function readStock(raw: Record<string, unknown>, sizeCount: number): number | undefined {
  if (!Object.hasOwn(raw, 'stock')) return undefined;
  if (sizeCount > 0) invalid('Enter starting stock on each size, not one number.');
  if (!isIntegerInRange(raw['stock'], 0, MAX_COUNT)) {
    invalid('Starting stock must be a whole number from 0 to 100,000.');
  }
  return raw['stock'];
}

function readWeightGrams(raw: Record<string, unknown>): number | null | undefined {
  if (!Object.hasOwn(raw, 'weightGrams')) return undefined;
  const value = raw['weightGrams'];
  if (value === undefined || value === null) return null;
  // 0 is allowed: small items such as socks never add to the parcel.
  if (!isIntegerInRange(value, 0, MAX_WEIGHT_GRAMS)) {
    invalid('Weight must be a whole number of grams from 0 to 100,000.');
  }
  return value;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function plain(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) invalid('Send the product details.');
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}
