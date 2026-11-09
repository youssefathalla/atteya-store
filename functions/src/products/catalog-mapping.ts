/**
 * Product types, brands and size order for the catalogue.
 * Keep in sync with src/app/core/services/products/product.constants.ts.
 */

export const PRODUCT_CATEGORY_IDS = ['rackets', 'apparel', 'bags', 'accessories'] as const;
export type ProductCategoryId = (typeof PRODUCT_CATEGORY_IDS)[number];

export const PLACEHOLDER_CATEGORY_IDS = ['hoodies', 'tracksuits', 'bundles'] as const;

export const PRODUCT_TYPES = [
  { id: 'rackets', label: 'Rackets', category: 'rackets' },
  { id: 'bags', label: 'Bags & backpacks', category: 'bags' },
  { id: 't-shirts', label: 'T-shirts & polos', category: 'apparel' },
  { id: 'shorts', label: 'Shorts', category: 'apparel' },
  { id: 'socks', label: 'Socks', category: 'apparel' },
  { id: 'sets', label: 'Sets', category: 'apparel' },
  { id: 'grips', label: 'Grips & protectors', category: 'accessories' },
  { id: 'balls', label: 'Balls', category: 'accessories' },
  { id: 'bottles', label: 'Bottles', category: 'accessories' },
  { id: 'supports', label: 'Supports & sleeves', category: 'accessories' },
] as const;

export type ProductTypeId = (typeof PRODUCT_TYPES)[number]['id'];

export const PRODUCT_BRANDS = [
  { id: 'adidas', label: 'adidas' },
  { id: 'bullpadel', label: 'Bullpadel' },
  { id: 'siux', label: 'Siux' },
  { id: 'nox', label: 'NOX' },
  { id: 'babolat', label: 'Babolat' },
  { id: 'on-cloud', label: 'On' },
  { id: 'head', label: 'HEAD' },
  { id: 'wilson', label: 'Wilson' },
  { id: 'floky', label: 'Floky' },
  { id: 'asics', label: 'ASICS' },
  { id: 'cork', label: 'Cork' },
  { id: 'atteya', label: 'Atteya' },
] as const;

export type BrandId = (typeof PRODUCT_BRANDS)[number]['id'];

/** Nav brand with no products yet. Counted as 0 so the link can be hidden. */
export const PLACEHOLDER_BRAND_IDS = ['puma'] as const;

export const CATALOG_CATEGORY_IDS: readonly string[] = [...PRODUCT_CATEGORY_IDS, ...PLACEHOLDER_CATEGORY_IDS];

export const CATALOG_TYPE_IDS: readonly string[] = PRODUCT_TYPES.map((type) => type.id);

export const CATALOG_BRAND_IDS: readonly string[] = [
  ...PRODUCT_BRANDS.map((brand) => brand.id),
  ...PLACEHOLDER_BRAND_IDS,
];

export const SIZE_ORDER: readonly string[] = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  'T1 (XS\u2013S)',
  'T1',
  'T2 (M)',
  'T2',
  'T3 (L\u2013XL)',
  'T3',
  'T4 (2XL)',
  'T4',
];

const TYPE_CATEGORY: Readonly<Record<ProductTypeId, ProductCategoryId>> = {
  rackets: 'rackets',
  bags: 'bags',
  't-shirts': 'apparel',
  shorts: 'apparel',
  socks: 'apparel',
  sets: 'apparel',
  grips: 'accessories',
  balls: 'accessories',
  bottles: 'accessories',
  supports: 'accessories',
};

export function categoryForType(type: ProductTypeId): ProductCategoryId {
  return TYPE_CATEGORY[type];
}

export function collapseSpaces(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(' ');
}

export function sizeRank(label: string): number {
  const index = SIZE_ORDER.indexOf(label);
  return index === -1 ? SIZE_ORDER.length : index;
}
