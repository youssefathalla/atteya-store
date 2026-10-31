/**
 * Catalogue taxonomy for Step 1b.
 * Keep in sync with functions/src/products/catalog-mapping.ts.
 */

export const PRODUCTS_COLLECTION = 'products';
export const CATEGORIES_COLLECTION = 'categories';
export const BRANDS_COLLECTION = 'brands';
export const CATALOG_DOC = ['settings', 'catalog'] as const;

export const PRODUCT_CATEGORY_IDS = ['rackets', 'apparel', 'bags', 'accessories'] as const;

export const PLACEHOLDER_CATEGORY_IDS = ['hoodies', 'tracksuits', 'bundles'] as const;

export const PRODUCT_CATEGORIES = [
  { id: 'rackets', label: 'Rackets' },
  { id: 'apparel', label: 'Apparel' },
  { id: 'bags', label: 'Bags & gear' },
  { id: 'accessories', label: 'Accessories' },
] as const;

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

export const PRODUCT_TYPE_IDS = [
  'rackets',
  'bags',
  't-shirts',
  'shorts',
  'socks',
  'sets',
  'grips',
  'balls',
  'bottles',
  'supports',
] as const;

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

export const PRODUCT_BRAND_IDS = [
  'adidas',
  'bullpadel',
  'siux',
  'nox',
  'babolat',
  'on-cloud',
  'head',
  'wilson',
  'floky',
  'asics',
  'cork',
  'atteya',
] as const;

/** Shown in the nav, with no products yet. */
export const PLACEHOLDER_BRAND_IDS = ['puma'] as const;

export const CATALOG_CATEGORY_IDS = [...PRODUCT_CATEGORY_IDS, ...PLACEHOLDER_CATEGORY_IDS] as const;
export const CATALOG_BRAND_IDS = [...PRODUCT_BRAND_IDS, ...PLACEHOLDER_BRAND_IDS] as const;

export const SIZE_ORDER = [
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
] as const;

/** Optional shop-for facet. Missing/empty = not set (storefront may treat as unisex later). */
export const PRODUCT_GENDER_IDS = ['women', 'men', 'kids', 'unisex'] as const;

export const PRODUCT_GENDERS = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
  { id: 'kids', label: 'Kids' },
  { id: 'unisex', label: 'Unisex' },
] as const;

export const LOCKABLE_PRODUCT_FIELDS = [
  'type',
  'brandId',
  'modelGroup',
  'published',
  'categoryIds',
  'colors',
  'tags',
] as const;
