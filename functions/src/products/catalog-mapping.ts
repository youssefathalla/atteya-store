/**
 * Taxonomy for the EasyOrders catalogue.
 * Keep in sync with src/app/core/services/products/product.constants.ts.
 * Collection ids were read from the public categories endpoint on 23 Oct 2026.
 */

export const PRODUCT_CATEGORY_IDS = ['rackets', 'apparel', 'bags', 'accessories'] as const;
export type ProductCategoryId = (typeof PRODUCT_CATEGORY_IDS)[number];

export const PLACEHOLDER_CATEGORY_IDS = ['shoes', 'hoodies', 'bundles'] as const;

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

export const CATALOG_CATEGORY_IDS: readonly string[] = [
  ...PRODUCT_CATEGORY_IDS,
  ...PLACEHOLDER_CATEGORY_IDS,
];

export const CATALOG_TYPE_IDS: readonly string[] = PRODUCT_TYPES.map((type) => type.id);

export const CATALOG_BRAND_IDS: readonly string[] = [
  ...PRODUCT_BRANDS.map((brand) => brand.id),
  ...PLACEHOLDER_BRAND_IDS,
];

const RACKET_COLLECTION = 'ca42f64c-7c13-4b73-9359-b29d519d6ab2';
const BAGS_COLLECTION = '5f603e67-fec4-45f5-b5ed-cb1c03005555';
const SOCKS_COLLECTION = 'dcd79947-1b36-4ec2-a073-fbc6b50734cc';
const SHORTS_COLLECTION = '83d1bf24-73c3-4dcf-85d5-82565baab107';

const BRAND_COLLECTIONS: Readonly<Record<string, BrandId>> = {
  '0f59f870-ad2e-4844-b96e-d46e4cc09f6c': 'adidas',
  '094d4aae-2ff3-4c12-96e8-05331b4d2cb3': 'bullpadel',
  'b345fbbb-5077-45e7-9cf5-bb8a02704e5c': 'siux',
  'ca757226-edc9-47c0-9cb7-9b7865ab4f0d': 'nox',
  '571be43d-359d-4a5d-9912-628565580b4c': 'babolat',
  'c90ea8b0-1337-40ec-ac11-d9b1d0c9c47b': 'on-cloud',
  '3b0885ff-029b-4c19-b6a2-538a03513d4c': 'head',
};

const TYPE_OVERRIDES: Readonly<Record<string, ProductTypeId>> = {
  'e7a1e668-9696-4adf-8731-765299306bf1': 't-shirts',
  'dbe9c3f2-77dc-466a-a2ee-60c5f72bab81': 'supports',
  '380961db-2955-4177-ae28-28c1b07a8d4d': 'grips',
  'ab7103b6-7bf2-4fe0-913a-53abb89aebf5': 'grips',
};

const NAME_TYPE_RULES: readonly { readonly type: ProductTypeId; readonly pattern: RegExp }[] = [
  { type: 'sets', pattern: /\bset\b|bundle/i },
  { type: 'bags', pattern: /bag|backpack/i },
  { type: 'socks', pattern: /sock/i },
  { type: 'shorts', pattern: /short/i },
  { type: 'bottles', pattern: /bottle/i },
  { type: 'balls', pattern: /\bballs?\b/i },
  { type: 'grips', pattern: /grip|protector/i },
  { type: 'supports', pattern: /support|sleeve|knee/i },
  { type: 't-shirts', pattern: /t-?shirt|tshirt|shirt|polo/i },
];

const NAME_BRAND_RULES: readonly { readonly brand: BrandId; readonly pattern: RegExp }[] = [
  { brand: 'adidas', pattern: /adidas/i },
  { brand: 'bullpadel', pattern: /bullpadel/i },
  { brand: 'siux', pattern: /siux|suix/i },
  { brand: 'nox', pattern: /\bnox\b/i },
  { brand: 'babolat', pattern: /babolat|babolta|lebron/i },
  { brand: 'on-cloud', pattern: /on ?cloud/i },
  { brand: 'head', pattern: /\bhead\b/i },
  { brand: 'wilson', pattern: /wilson/i },
  { brand: 'floky', pattern: /floky/i },
  { brand: 'asics', pattern: /asics/i },
  { brand: 'cork', pattern: /\bcork\b/i },
  { brand: 'atteya', pattern: /atteya/i },
];

const MODEL_GROUPS: Readonly<Record<string, string>> = {
  '15c191e1-9acc-4746-b41f-726912842219': 'adidas-control-bag',
  'd48c8be2-96fd-42d8-af46-0fb3d8e1d260': 'adidas-control-bag',
  'e6622ea2-82e6-458e-ad06-87553caab750': 'adidas-multigame-bag',
  '4e5200d1-4c7b-4bd6-b944-3d2194551f22': 'adidas-multigame-bag',
  '1e19afe4-4c6d-4eda-95ec-c3d3f123fa38': 'adidas-multigame-bag',
  'd9b40db9-1e36-4938-87e8-11c6590dc668': 'on-cloud-short',
  'c9b5fa5e-8314-4fa4-9cb2-a19082ef2ccc': 'on-cloud-short',
  'e51cb954-12fd-4dd3-b8d2-0ae01343251a': 'on-cloud-short',
  '618666e6-0bdc-4564-b53a-ac06b827d424': 'on-cloud-socks',
  'e8bb355b-8089-4446-8f0a-5139becce1e0': 'on-cloud-socks',
  '64b8faea-c0e4-47ce-b52f-2f85fd53a50f': 'nox-socks',
  '2dc72650-7a71-425d-aac6-24f265aa3b9e': 'nox-socks',
  '6fb771ba-ae67-4a6d-8b51-832b619fa158': 'siux-socks',
  '1b062b7d-9502-4858-bf7f-f8106fdc1e75': 'siux-socks',
  '5812cfbe-840e-42fa-8a40-007445107e8d': 'adidas-simple-polo',
  '325839fb-5572-4cf5-9c63-ef42c445207d': 'adidas-simple-polo',
  'd1888ec1-a5a7-4fd5-b2e2-044ac6153df0': 'on-cloud-tshirt',
  '8117429a-263d-4f56-a2ff-0b24cf694a32': 'on-cloud-tshirt',
  'ed5e57a8-bdf9-48de-8d26-d124ac539b43': 'on-cloud-tshirt',
  '016826d2-9748-4870-ac1c-cefbc03dff0c': 'babolat-lebron-tshirt',
  '90096f7f-52be-406e-9391-af7d3fddeb7e': 'babolat-lebron-tshirt',
  '1e022941-f999-4e09-9ab4-45b8768426a0': 'babolat-lebron-tshirt',
  '3b753dfb-da9f-4c29-84ae-1121e76dff13': 'babolat-lebron-tshirt',
};

const SIZE_ALIASES: Readonly<Record<string, string>> = {
  '2xl': '2XL',
  xxl: '2XL',
  '3xl': '3XL',
  xl: 'XL',
  't1 xs-s': 'T1 (XS\u2013S)',
  't2- m': 'T2 (M)',
  't2-m': 'T2 (M)',
  't3 l-xl': 'T3 (L\u2013XL)',
  't4- xxl': 'T4 (2XL)',
  't4-xxl': 'T4 (2XL)',
};

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

const SIZE_LABELS = new Set<string>(SIZE_ORDER);

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

export function resolveProductType(
  easyOrdersId: string,
  name: string,
  categoryIds: readonly string[],
): ProductTypeId | null {
  const override = TYPE_OVERRIDES[easyOrdersId];
  if (override) return override;

  const categories = new Set(categoryIds);
  if (categories.has(RACKET_COLLECTION)) return 'rackets';
  if (categories.has(BAGS_COLLECTION)) return 'bags';
  if (categories.has(SOCKS_COLLECTION)) return 'socks';
  if (categories.has(SHORTS_COLLECTION)) return 'shorts';

  for (const rule of NAME_TYPE_RULES) {
    if (rule.pattern.test(name)) return rule.type;
  }
  return null;
}

export function resolveBrand(name: string, categoryIds: readonly string[]): BrandId | null {
  const hits: BrandId[] = [];
  for (const categoryId of categoryIds) {
    const brand = BRAND_COLLECTIONS[categoryId];
    if (brand && !hits.includes(brand)) hits.push(brand);
  }
  if (hits.length === 1) return hits[0];

  for (const rule of NAME_BRAND_RULES) {
    if (rule.pattern.test(name)) return rule.brand;
  }
  return null;
}

export function resolveModelGroup(easyOrdersId: string): string | null {
  return MODEL_GROUPS[easyOrdersId] ?? null;
}

export function collapseSpaces(value: string): string {
  return value.trim().split(/\s+/).filter((part) => part.length > 0).join(' ');
}

export function normalizeSizeLabel(raw: string): string {
  const collapsed = collapseSpaces(raw);
  const alias = SIZE_ALIASES[collapsed.toLowerCase()];
  if (alias) return alias;
  return collapsed.toUpperCase();
}

export function looksLikeSize(raw: string): boolean {
  return SIZE_LABELS.has(normalizeSizeLabel(raw));
}

export function sizeRank(label: string): number {
  const index = SIZE_ORDER.indexOf(label);
  return index === -1 ? SIZE_ORDER.length : index;
}
