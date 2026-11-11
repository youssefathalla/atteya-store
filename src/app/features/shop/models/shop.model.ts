import type { ColorId } from '@core/services/products/catalog-taxonomy';
import type { CatalogSort } from '@core/services/search';

/** Top-level shop category tabs (All + seed roots). Padel tab maps to rackets. */
export type ShopTabId = 'all' | 'apparel' | 'accessories' | 'rackets';

export type ShopCategoryFilterId = 'apparel' | 'accessories' | 'rackets' | 'bags';

export type ShopGenderFilterId = 'women' | 'men';

export interface ShopTab {
  readonly id: ShopTabId;
  readonly label: string;
  readonly path: string;
}

export interface ShopCategoryOption {
  readonly id: ShopCategoryFilterId;
  readonly label: string;
  /** Firestore / Algolia `categoryIds` value. */
  readonly categoryId: string;
}

export interface ShopFacetValue {
  readonly value: string;
  readonly count: number;
}

export interface ShopColorOption {
  readonly id: ColorId;
  readonly label: string;
  readonly count: number;
}

export interface ShopBrandOption {
  readonly name: string;
  readonly count: number;
}

export interface ShopPlayerOption {
  /** Link name from `settings/players` (`?player=ale-galan`). */
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface ShopSizeOption {
  readonly label: string;
  readonly count: number;
}

/** URL / UI filter state for the shop listing. */
export interface ShopFilterState {
  readonly sort: CatalogSort;
  readonly categories: readonly ShopCategoryFilterId[];
  readonly brands: readonly string[];
  /** Player ids (`?player=ale-galan,agustin-tapia`). */
  readonly players: readonly string[];
  readonly sizes: readonly string[];
  readonly colors: readonly ColorId[];
  readonly genders: readonly ShopGenderFilterId[];
  /** Only products still in their New arrival period (`?newArrivals=1`). */
  readonly newArrivals: boolean;
  readonly onSale: boolean;
  readonly inStock: boolean;
  readonly page: number;
}

export const SHOP_TABS: readonly ShopTab[] = [
  { id: 'all', label: 'All', path: '/shop' },
  { id: 'apparel', label: 'Apparel', path: '/category/apparel' },
  { id: 'accessories', label: 'Accessories', path: '/category/accessories' },
  { id: 'rackets', label: 'Padel', path: '/category/rackets' },
] as const;

export const SHOP_CATEGORY_OPTIONS: readonly ShopCategoryOption[] = [
  { id: 'apparel', label: 'Apparel', categoryId: 'apparel' },
  { id: 'accessories', label: 'Accessories', categoryId: 'accessories' },
  { id: 'rackets', label: 'Padel', categoryId: 'rackets' },
  { id: 'bags', label: 'Bags', categoryId: 'bags' },
] as const;

/** Closed colour list for the shop filter (spec + Multi). */
export const SHOP_COLOR_IDS = [
  'black',
  'white',
  'grey',
  'blue',
  'navy',
  'light-blue',
  'green',
  'red',
  'orange',
  'yellow',
  'pink',
  'multi',
] as const satisfies readonly ColorId[];

export const APPAREL_LETTER_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] as const;

export const SHOP_SORT_OPTIONS: readonly {
  readonly value: CatalogSort;
  readonly label: string;
}[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
] as const;

export const SHOP_GENDER_OPTIONS: readonly {
  readonly id: ShopGenderFilterId;
  readonly label: string;
}[] = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
] as const;

export const DEFAULT_SHOP_FILTERS: ShopFilterState = {
  sort: 'featured',
  categories: [],
  brands: [],
  players: [],
  sizes: [],
  colors: [],
  genders: [],
  newArrivals: false,
  onSale: false,
  inStock: false,
  page: 0,
};
