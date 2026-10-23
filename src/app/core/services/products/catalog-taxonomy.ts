/**
 * Shared catalogue taxonomy seed and tree helpers.
 * Keep in sync with functions/src/products/catalog-taxonomy.ts.
 */
import type { PRODUCT_TYPE_IDS } from './product.constants';

type ProductTypeId = (typeof PRODUCT_TYPE_IDS)[number];

export interface SeedCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ancestorIds: readonly string[];
  readonly path: string;
  readonly depth: 0 | 1;
  readonly sortOrder: number;
  readonly published: boolean;
}

export interface SeedBrand {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly published: boolean;
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    id: 'rackets',
    slug: 'rackets',
    name: 'Rackets',
    parentId: null,
    ancestorIds: [],
    path: 'rackets',
    depth: 0,
    sortOrder: 10,
    published: true,
  },
  {
    id: 'apparel',
    slug: 'apparel',
    name: 'Apparel',
    parentId: null,
    ancestorIds: [],
    path: 'apparel',
    depth: 0,
    sortOrder: 20,
    published: true,
  },
  {
    id: 't-shirts',
    slug: 't-shirts',
    name: 'T-shirts & polos',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/t-shirts',
    depth: 1,
    sortOrder: 10,
    published: true,
  },
  {
    id: 'shorts',
    slug: 'shorts',
    name: 'Shorts',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/shorts',
    depth: 1,
    sortOrder: 20,
    published: true,
  },
  {
    id: 'socks',
    slug: 'socks',
    name: 'Socks',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/socks',
    depth: 1,
    sortOrder: 30,
    published: true,
  },
  {
    id: 'sets',
    slug: 'sets',
    name: 'Sets',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/sets',
    depth: 1,
    sortOrder: 40,
    published: true,
  },
  {
    id: 'hoodies',
    slug: 'hoodies',
    name: 'Hoodies',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/hoodies',
    depth: 1,
    sortOrder: 50,
    published: false,
  },
  {
    id: 'tracksuits',
    slug: 'tracksuits',
    name: 'Tracksuits',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/tracksuits',
    depth: 1,
    sortOrder: 60,
    published: false,
  },
  {
    id: 'shoes',
    slug: 'shoes',
    name: 'Shoes',
    parentId: null,
    ancestorIds: [],
    path: 'shoes',
    depth: 0,
    sortOrder: 30,
    published: false,
  },
  {
    id: 'bags',
    slug: 'bags',
    name: 'Bags & gear',
    parentId: null,
    ancestorIds: [],
    path: 'bags',
    depth: 0,
    sortOrder: 40,
    published: true,
  },
  {
    id: 'accessories',
    slug: 'accessories',
    name: 'Accessories',
    parentId: null,
    ancestorIds: [],
    path: 'accessories',
    depth: 0,
    sortOrder: 50,
    published: true,
  },
  {
    id: 'grips',
    slug: 'grips',
    name: 'Grips & protectors',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/grips',
    depth: 1,
    sortOrder: 10,
    published: true,
  },
  {
    id: 'balls',
    slug: 'balls',
    name: 'Balls',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/balls',
    depth: 1,
    sortOrder: 20,
    published: true,
  },
  {
    id: 'bottles',
    slug: 'bottles',
    name: 'Bottles',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/bottles',
    depth: 1,
    sortOrder: 30,
    published: true,
  },
  {
    id: 'supports',
    slug: 'supports',
    name: 'Supports & sleeves',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/supports',
    depth: 1,
    sortOrder: 40,
    published: true,
  },
  {
    id: 'bundles',
    slug: 'bundles',
    name: 'Bundles',
    parentId: null,
    ancestorIds: [],
    path: 'bundles',
    depth: 0,
    sortOrder: 60,
    published: false,
  },
] as const;

export const SEED_BRANDS: readonly SeedBrand[] = [
  { id: 'adidas', slug: 'adidas', name: 'adidas', sortOrder: 10, published: true },
  { id: 'bullpadel', slug: 'bullpadel', name: 'Bullpadel', sortOrder: 20, published: true },
  { id: 'siux', slug: 'siux', name: 'Siux', sortOrder: 30, published: true },
  { id: 'nox', slug: 'nox', name: 'NOX', sortOrder: 40, published: true },
  { id: 'babolat', slug: 'babolat', name: 'Babolat', sortOrder: 50, published: true },
  { id: 'on-cloud', slug: 'on-cloud', name: 'On', sortOrder: 60, published: true },
  { id: 'head', slug: 'head', name: 'HEAD', sortOrder: 70, published: true },
  { id: 'wilson', slug: 'wilson', name: 'Wilson', sortOrder: 80, published: true },
  { id: 'floky', slug: 'floky', name: 'Floky', sortOrder: 90, published: true },
  { id: 'asics', slug: 'asics', name: 'ASICS', sortOrder: 100, published: true },
  { id: 'cork', slug: 'cork', name: 'Cork', sortOrder: 110, published: true },
  { id: 'atteya', slug: 'atteya', name: 'Atteya', sortOrder: 120, published: true },
  { id: 'puma', slug: 'puma', name: 'PUMA', sortOrder: 130, published: false },
] as const;

export const DEFAULT_CATEGORY_FOR_TYPE: Readonly<Record<ProductTypeId, string>> = {
  rackets: 'rackets',
  bags: 'bags',
  't-shirts': 't-shirts',
  shorts: 'shorts',
  socks: 'socks',
  sets: 'sets',
  grips: 'grips',
  balls: 'balls',
  bottles: 'bottles',
  supports: 'supports',
};

const SEED_CATEGORY_BY_ID = new Map<string, SeedCategory>(
  SEED_CATEGORIES.map((category) => [category.id, category]),
);

/**
 * Returns the category branch (root first, leaf last) for a given leaf category id.
 * For example, 't-shirts' -> ['apparel', 't-shirts'], 'rackets' -> ['rackets'].
 */
export function categoryIdsFor(leafId: string): string[] {
  const category = SEED_CATEGORY_BY_ID.get(leafId);
  if (!category) return [leafId];
  return [...category.ancestorIds, category.id];
}
