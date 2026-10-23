import { createHash } from 'node:crypto';
import {
  categoryForType,
  collapseSpaces,
  looksLikeSize,
  normalizeSizeLabel,
  resolveBrand,
  resolveModelGroup,
  resolveProductType,
  sizeRank,
  type BrandId,
  type ProductCategoryId,
  type ProductTypeId,
} from './catalog-mapping.js';
import { cleanDescription } from './description-html.js';
import type {
  EasyOrdersProduct,
  EasyOrdersVariation,
  EasyOrdersVariationProp,
} from './easyorders.types.js';
import { slugBase } from './slug.js';

const ALT_MAX = 125;
const SUMMARY_MAX = 300;
const GALLERY_MAX = 8;
const DETAIL_MAX = 8;
const ALLOWED_IMAGE_HOSTS = new Set([
  'easyorders.fra1.digitaloceanspaces.com',
  'files.easy-orders.net',
]);

export type ImportAction = 'create' | 'update' | 'unchanged';

export interface MappedImageRef {
  readonly sourceUrl: string;
  readonly alt: string;
}

export interface MappedOptionValue {
  readonly id: string;
  readonly label: string;
  readonly swatch?: string;
  readonly image?: MappedImageRef;
}

export interface MappedOption {
  readonly key: 'size' | 'colour' | 'gift' | 'choice';
  readonly label: string;
  /** Lowercase EasyOrders variation name. Used to match stock rows. Not stored. */
  readonly matchName: string;
  readonly values: readonly MappedOptionValue[];
}

export interface MappedVariant {
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
  readonly stock: number;
}

export interface MappedProduct {
  readonly docId: string;
  readonly easyOrdersId: string;
  readonly slugBase: string;
  readonly name: string;
  readonly summary: string | null;
  readonly descriptionHtml: string | null;
  readonly detailImages: readonly MappedImageRef[];
  readonly category: ProductCategoryId;
  readonly type: ProductTypeId;
  readonly brand: BrandId;
  readonly modelGroup: string | null;
  readonly currency: 'EGP';
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly gallery: readonly MappedImageRef[];
  readonly options: readonly MappedOption[];
  readonly trackStock: boolean;
  readonly variants: readonly MappedVariant[];
  readonly published: boolean;
  readonly sourceSlug: string;
  readonly categoryIds: readonly string[];
  readonly sourceUpdatedAt: string;
  readonly createdAtIso: string;
  readonly warnings: readonly string[];
  readonly skippedImageCount: number;
}

export interface MapFailure {
  readonly id: string;
  readonly name: string;
  readonly message: string;
}

export type MapOutcome =
  | { readonly ok: true; readonly product: MappedProduct }
  | { readonly ok: false; readonly failure: MapFailure };

export function mapEasyOrdersProduct(raw: unknown): MapOutcome {
  const product = asProduct(raw);
  const id = typeof product.id === 'string' ? product.id.trim().toLowerCase() : '';
  const name = collapseSpaces(typeof product.name === 'string' ? product.name : '');
  if (!id || !name) {
    return { ok: false, failure: { id, name: name || 'Unnamed product', message: 'A product was missing its name or id.' } };
  }

  const categoryIds = readCategoryIds(product);
  const type = resolveProductType(id, name, categoryIds);
  const brand = resolveBrand(name, categoryIds);
  if (!type || !brand) {
    const missing = [type ? '' : 'type', brand ? '' : 'brand'].filter((part) => part.length > 0);
    return {
      ok: false,
      failure: {
        id,
        name,
        message: `${name} could not be placed (${missing.join(' and ')}).`,
      },
    };
  }

  const warnings: string[] = [];
  let skippedImages = 0;
  const skipImage = (message: string): void => {
    skippedImages += 1;
    warnings.push(message);
  };
  const money = mapMoney(product.price, product.sale_price, name, warnings);
  const gallery = collectGallery(product, name, warnings, skipImage);
  const options = mapOptions(product.variations ?? [], name, warnings, skipImage);
  const description = cleanDescription(typeof product.description === 'string' ? product.description : '');
  const detailImages = description.imageUrls.slice(0, DETAIL_MAX).flatMap((url) => {
    const image = acceptImage(url, clipAlt(name), skipImage);
    return image ? [image] : [];
  });
  if (description.imageUrls.length > DETAIL_MAX) {
    warnings.push('Extra photos inside the description were left out.');
  }

  const trackStock = product.track_stock === true;
  const createdAtIso = typeof product.created_at === 'string' ? product.created_at : '';
  if (!createdAtIso || Number.isNaN(Date.parse(createdAtIso))) {
    warnings.push('The original date was missing, so today is used.');
  }

  return {
    ok: true,
    product: {
      docId: `eo-${id}`,
      easyOrdersId: id,
      slugBase: slugBase(typeof product.slug === 'string' ? product.slug : '', name),
      name,
      summary: clipSummary(typeof product.meta_description === 'string' ? product.meta_description : ''),
      descriptionHtml: description.html,
      detailImages,
      category: categoryForType(type),
      type,
      brand,
      modelGroup: resolveModelGroup(id),
      currency: 'EGP',
      price: money.price,
      compareAtPrice: money.compareAtPrice,
      gallery,
      options,
      trackStock,
      variants: trackStock ? mapVariants(product, options, warnings) : [],
      published: product.hidden !== true,
      sourceSlug: typeof product.slug === 'string' ? product.slug.trim() : '',
      categoryIds: [...categoryIds].sort(),
      sourceUpdatedAt: typeof product.updated_at === 'string' ? product.updated_at : '',
      createdAtIso,
      warnings,
      skippedImageCount: skippedImages,
    },
  };
}

export function imageObjectPath(docId: string, sourceUrl: string): string {
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 16);
  return `products/${docId}/${hash}.${extensionFromUrl(sourceUrl)}`;
}

export function clipAlt(text: string): string {
  const trimmed = collapseSpaces(text);
  if (trimmed.length === 0) return 'Product photo';
  if (trimmed.length <= ALT_MAX) return trimmed;
  return trimmed.slice(0, ALT_MAX).trim();
}

function clipSummary(text: string): string | null {
  const trimmed = collapseSpaces(text);
  if (trimmed.length === 0) return null;
  if (trimmed.length <= SUMMARY_MAX) return trimmed;
  return trimmed.slice(0, SUMMARY_MAX).trim();
}

function asProduct(raw: unknown): EasyOrdersProduct {
  if (typeof raw === 'object' && raw !== null) return raw as EasyOrdersProduct;
  return {};
}

function readCategoryIds(product: EasyOrdersProduct): string[] {
  const parsed = product.parsed_categories;
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  const categories = product.categories;
  if (!Array.isArray(categories)) return [];
  return categories.flatMap((category) =>
    category && typeof category.id === 'string' && category.id.length > 0 ? [category.id] : [],
  );
}

function mapMoney(
  price: unknown,
  salePrice: unknown,
  name: string,
  warnings: string[],
): { price: number; compareAtPrice: number | null } {
  const base = wholePounds(price);
  const sale = wholePounds(salePrice);
  if (base === null) {
    warnings.push(`${name} had no whole-number price, so 0 was used.`);
    return { price: 0, compareAtPrice: null };
  }
  if (sale !== null && sale > 0 && sale < base) {
    return { price: sale, compareAtPrice: base };
  }
  return { price: base, compareAtPrice: null };
}

function wholePounds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function collectGallery(
  product: EasyOrdersProduct,
  name: string,
  warnings: string[],
  skipImage: (message: string) => void,
): MappedImageRef[] {
  const urls: string[] = [];
  const thumb = typeof product.thumb === 'string' ? product.thumb.trim() : '';
  if (thumb) urls.push(thumb);
  for (const image of product.images ?? []) {
    if (typeof image === 'string' && image.trim()) urls.push(image.trim());
  }
  const seen = new Set<string>();
  const gallery: MappedImageRef[] = [];
  const alt = clipAlt(name);
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    if (gallery.length >= GALLERY_MAX) continue;
    const accepted = acceptImage(url, alt, skipImage);
    if (accepted) gallery.push(accepted);
  }
  if (seen.size > GALLERY_MAX) warnings.push('Only the first 8 photos were kept.');
  return gallery;
}

function acceptImage(url: string, alt: string, skipImage: (message: string) => void): MappedImageRef | null {
  let host = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') {
      skipImage('Skipped a photo that was not a secure link.');
      return null;
    }
  } catch {
    skipImage('Skipped a photo with a broken link.');
    return null;
  }
  if (!ALLOWED_IMAGE_HOSTS.has(host)) {
    skipImage(`Skipped a photo from ${host}.`);
    return null;
  }
  return { sourceUrl: url, alt };
}

function extensionFromUrl(url: string): string {
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return 'jpg';
  }
  if (path.endsWith('.png')) return 'png';
  if (path.endsWith('.webp')) return 'webp';
  if (path.endsWith('.avif') || path.endsWith('.avifs')) return 'avif';
  return 'jpg';
}

interface OptionDraft {
  key: MappedOption['key'];
  label: string;
  warning?: string;
}

function optionDraft(name: string): OptionDraft {
  const normalized = collapseSpaces(name).toLowerCase();
  if (normalized === 'choose your size') return { key: 'size', label: 'Size' };
  if (normalized === 'choose color' || normalized === 'choose your color') {
    return { key: 'colour', label: 'Colour' };
  }
  if (normalized === 'choose your shirt') return { key: 'gift', label: 'Free shirt' };
  if (normalized === 'choose your socks') return { key: 'gift', label: 'Free socks' };
  if (normalized === 'choose one') return { key: 'choice', label: 'Choose your pair' };
  return {
    key: 'choice',
    label: collapseSpaces(name),
    warning: `"${collapseSpaces(name)}" was kept as a choice.`,
  };
}

function mapOptions(
  variations: readonly EasyOrdersVariation[],
  name: string,
  warnings: string[],
  skipImage: (message: string) => void,
): MappedOption[] {
  const options: MappedOption[] = [];
  for (const variation of variations) {
    const rawName = typeof variation.name === 'string' ? variation.name : 'Choice';
    const draft = optionDraft(rawName);
    const props = variation.props ?? [];
    const rawLabels = props.map((prop) => (typeof prop.name === 'string' ? prop.name : ''));
    let key = draft.key;
    let label = draft.label;
    const hasLabel = rawLabels.some((value) => collapseSpaces(value).length > 0);
    if (key === 'size' && hasLabel && !rawLabels.some((value) => looksLikeSize(value))) {
      key = 'choice';
      label = collapseSpaces(rawName);
      warnings.push(`"${collapseSpaces(rawName)}" does not look like sizes, so it was saved as a choice.`);
    } else if (draft.warning) {
      warnings.push(draft.warning);
    }
    const values = mapOptionValues(props, key, name, skipImage);
    options.push({
      key,
      label,
      matchName: collapseSpaces(rawName).toLowerCase(),
      values: key === 'size' ? sortSizes(values) : values,
    });
  }
  return options;
}

function mapOptionValues(
  props: readonly EasyOrdersVariationProp[],
  key: MappedOption['key'],
  productName: string,
  skipImage: (message: string) => void,
): MappedOptionValue[] {
  const values: MappedOptionValue[] = [];
  for (const prop of props) {
    const id = typeof prop.id === 'string' ? prop.id.trim() : '';
    const rawLabel = typeof prop.name === 'string' ? prop.name : '';
    if (!id || !collapseSpaces(rawLabel)) continue;
    const label = key === 'size' ? normalizeSizeLabel(rawLabel) : collapseSpaces(rawLabel);
    const value: MappedOptionValue = { id, label, ...optionValueExtras(prop.value, productName, label, skipImage) };
    values.push(value);
  }
  return values;
}

function optionValueExtras(
  raw: unknown,
  productName: string,
  label: string,
  skipImage: (message: string) => void,
): { swatch?: string; image?: MappedImageRef } {
  if (typeof raw !== 'string') return {};
  const value = raw.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) {
    const image = acceptImage(value, clipAlt(`${productName} ${label}`), skipImage);
    return image ? { image } : {};
  }
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return { swatch: value.toLowerCase() };
  return {};
}

function sortSizes(values: readonly MappedOptionValue[]): MappedOptionValue[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => {
      const rank = sizeRank(left.value.label) - sizeRank(right.value.label);
      return rank === 0 ? left.index - right.index : rank;
    })
    .map((entry) => entry.value);
}

function mapVariants(
  product: EasyOrdersProduct,
  options: readonly MappedOption[],
  warnings: string[],
): MappedVariant[] {
  const variants: MappedVariant[] = [];
  for (const variant of product.variants ?? []) {
    const id = typeof variant.id === 'string' ? variant.id.trim() : '';
    if (!id) continue;
    const values: Record<string, string> = {};
    let complete = true;
    for (const prop of variant.variation_props ?? []) {
      const variationName = typeof prop.variation === 'string' ? collapseSpaces(prop.variation) : '';
      const propName = typeof prop.variation_prop === 'string' ? collapseSpaces(prop.variation_prop) : '';
      const match = findOptionValue(options, variationName, propName);
      if (!match) {
        complete = false;
        break;
      }
      values[match.key] = match.valueId;
    }
    if (!complete) {
      warnings.push('One stock row could not be matched to its options and was left out.');
      continue;
    }
    const quantity = variant.quantity;
    const stock = typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
    variants.push({ id, values, stock });
  }
  return variants;
}

function findOptionValue(
  options: readonly MappedOption[],
  variationName: string,
  propName: string,
): { key: string; valueId: string } | null {
  const wantedVariation = collapseSpaces(variationName).toLowerCase();
  for (const option of options) {
    if (option.matchName !== wantedVariation) continue;
    const candidate = option.key === 'size' ? normalizeSizeLabel(propName) : collapseSpaces(propName);
    for (const value of option.values) {
      if (value.label.toLowerCase() === candidate.toLowerCase()) {
        return { key: option.key, valueId: value.id };
      }
    }
  }
  return null;
}
