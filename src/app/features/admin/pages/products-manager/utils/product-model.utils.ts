import { COLOR_PALETTE, type ColorId } from '@core/services/products/catalog-taxonomy';
import type { Product } from '@core/services/products/product.model';
import type { ImageAsset } from '@shared/schemas';
import type { ColourDraft, ModelSizeDraft } from '../models/product-admin.model';

const MAX_PRICE = 1_000_000;
const MAX_COUNT = 100_000;
const MAX_WEIGHT_GRAMS = 100_000;
/** Short summary: cards, the bag and search show up to this many words. */
export const SUMMARY_WORDS = 7;

/** The size option of a product, in its saved order. */
function sizeValues(product: Product): readonly { readonly id: string; readonly label: string }[] {
  return product.options.find((option) => option.key === 'size')?.values ?? [];
}

const labelKey = (label: string): string => label.trim().toLowerCase();

/**
 * One shared size list for every colour: the opened colour's sizes in its order, then sizes only
 * other colours have. A size is matched across colours by its name.
 */
export function sharedSizesFrom(anchor: Product, colours: readonly Product[]): ModelSizeDraft[] {
  const sizes: ModelSizeDraft[] = [];
  const seen = new Set<string>();
  for (const product of [anchor, ...colours.filter((colour) => colour.id !== anchor.id)]) {
    for (const value of sizeValues(product)) {
      const key = labelKey(value.label);
      if (seen.has(key) || sizes.some((size) => size.key === value.id)) continue;
      seen.add(key);
      sizes.push({ key: value.id, id: value.id, label: value.label });
    }
  }
  return sizes;
}

/** The price and old price most colours use (the opened colour wins a tie). */
export function sharedPriceOf(
  anchor: Product,
  colours: readonly Product[],
): { price: number; compareAtPrice: number | null } {
  const counts = new Map<string, number>();
  const keyOf = (product: Product): string => `${product.price}:${product.compareAtPrice ?? ''}`;
  for (const product of colours) counts.set(keyOf(product), (counts.get(keyOf(product)) ?? 0) + 1);
  let best = anchor;
  for (const product of colours) {
    if ((counts.get(keyOf(product)) ?? 0) > (counts.get(keyOf(best)) ?? 0)) best = product;
  }
  return { price: best.price, compareAtPrice: best.compareAtPrice };
}

/** A colour tab from its saved product document. */
export function colourDraftFrom(
  product: Product,
  version: string,
  sizes: readonly ModelSizeDraft[],
  shared: { price: number; compareAtPrice: number | null },
): ColourDraft {
  const own = sizeValues(product);
  const stock: Record<string, string> = {};
  const notMade: string[] = [];
  for (const size of sizes) {
    const match =
      own.find((value) => value.id === size.id) ??
      own.find((value) => labelKey(value.label) === labelKey(size.label));
    if (!match) {
      notMade.push(size.key);
      continue;
    }
    const count = product.stockBySize?.[match.id];
    stock[size.key] = typeof count === 'number' ? String(count) : '';
  }
  const ownPrice = product.price !== shared.price || product.compareAtPrice !== shared.compareAtPrice;
  return {
    productId: product.id,
    version,
    slug: product.slug,
    colors: product.colors ?? [],
    images: product.images.map((image) => toImageAsset(image)),
    published: product.published,
    ownPrice,
    price: String(product.price),
    compareAtPrice: product.compareAtPrice === null ? '' : String(product.compareAtPrice),
    stock,
    notMade,
    flatStock: own.length === 0 && typeof product.stock === 'number' ? String(product.stock) : '',
  };
}

/** A new colour tab: no photos, no stock, the product price, shown once it has photos and stock. */
export function newColourDraft(productId: string, color: ColorId): ColourDraft {
  return {
    productId,
    version: null,
    slug: null,
    colors: [color],
    images: [],
    published: true,
    ownPrice: false,
    price: '',
    compareAtPrice: '',
    stock: {},
    notMade: [],
    flatStock: '0',
  };
}

/** True when the colours were saved with different shared details. */
export function sharedDetailsDiffer(colours: readonly Product[]): boolean {
  if (colours.length < 2) return false;
  const fingerprint = (product: Product): string =>
    JSON.stringify([
      product.name.trim(),
      product.summary ?? '',
      product.descriptionHtml ?? '',
      product.details,
      product.categoryId,
      product.brandId,
      product.gender ?? null,
      [...product.players].sort(),
      product.weightGrams ?? null,
      sizeValues(product)
        .map((value) => labelKey(value.label))
        .sort(),
    ]);
  const first = fingerprint(colours[0]!);
  return colours.some((product) => fingerprint(product) !== first);
}

/** True when the colours were saved with different descriptions. */
export function descriptionsDiffer(colours: readonly Product[]): boolean {
  return new Set(colours.map((product) => product.descriptionHtml ?? '')).size > 1;
}

/** "Black", or "Black / White" for a colour saved with an accent colour. */
export function colourName(colors: readonly ColorId[]): string {
  if (colors.length === 0) return 'No colour';
  return colors.map((id) => COLOR_PALETTE.find((entry) => entry.id === id)?.label ?? id).join(' / ');
}

export function colourSwatch(color: ColorId | undefined): string | null {
  return COLOR_PALETTE.find((entry) => entry.id === color)?.swatch ?? null;
}

/** Total pieces of a colour across the sizes it is made in (blank boxes count as 0). */
export function colourTotal(colour: ColourDraft, sizes: readonly ModelSizeDraft[]): number {
  if (sizes.length === 0) return parseCount(colour.flatStock) ?? 0;
  return sizes.reduce((sum, size) => {
    if (colour.notMade.includes(size.key)) return sum;
    return sum + (parseCount(colour.stock[size.key] ?? '') ?? 0);
  }, 0);
}

export function collapseSpaces(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(' ');
}

export function wordCount(value: string): number {
  return collapseSpaces(value).split(' ').filter(Boolean).length;
}

export function asText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : '';
}

export function parseWholePounds(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_PRICE ? value : null;
}

export function parseCount(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : null;
}

export function parseWeightGrams(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_WEIGHT_GRAMS ? value : null;
}

export function isSafeProductPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 300 &&
    path.startsWith('products/') &&
    !path.startsWith('/') &&
    !path.includes('..') &&
    !path.includes('://')
  );
}

function toImageAsset(image: Product['images'][number]): ImageAsset {
  return {
    path: image.path,
    alt: image.alt,
    ...(typeof image.width === 'number' ? { width: image.width } : {}),
    ...(typeof image.height === 'number' ? { height: image.height } : {}),
  };
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TR',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
]);

/** Text for the textarea: blank line between blocks, newline for <br>. Round-trips with descriptionToHtml(). */
export function plainFromHtml(html: string | null): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const paragraphs: string[] = [];
  let current = '';
  const flush = (): void => {
    const text = current
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
    if (text.length > 0) paragraphs.push(text);
    current = '';
  };
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += (node.textContent ?? '').replace(/[\r\n]+/g, ' ');
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      current += '\n';
      return;
    }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) flush();
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  body.childNodes.forEach(walk);
  flush();
  return paragraphs.join('\n\n');
}
