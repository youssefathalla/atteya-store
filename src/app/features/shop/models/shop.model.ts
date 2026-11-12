import type { ColorId } from '@core/services/products/catalog-taxonomy';
import type { CatalogSort } from '@core/services/search';

export type { ShopCategoryOption, ShopTab } from '@core/services/products/utils/shop-categories';

/**
 * Shop tab: `all`, or a top-level category id. Tabs come from the live category list
 * (`shopTabsFrom()`), not a fixed list (ATS-249).
 */
export type ShopTabId = string;

/** A category id in Shop's Category filter (`?category=`), from `shopCategoryOptionsFrom()`. */
export type ShopCategoryFilterId = string;

export type ShopGenderFilterId = 'women' | 'men';

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
