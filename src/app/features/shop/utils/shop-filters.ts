import { COLOR_PALETTE, type ColorId } from '@core/services/products/catalog-taxonomy';
import { isPlayerId, type Player } from '@core/services/products/player.schema';
import type { CatalogBrowseOptions } from '@core/services/search';
import {
  shopCategoryIdForSlug,
  type ShopCategorySource,
} from '@core/services/products/utils/shop-categories';
import {
  APPAREL_LETTER_SIZES,
  DEFAULT_SHOP_FILTERS,
  SHOP_COLOR_IDS,
  type ShopBrandOption,
  type ShopCategoryFilterId,
  type ShopColorOption,
  type ShopFilterState,
  type ShopGenderFilterId,
  type ShopPlayerOption,
  type ShopSizeOption,
  type ShopTabId,
} from '../models/shop.model';

const COLOR_ID_SET = new Set<string>(SHOP_COLOR_IDS);
const GENDER_ID_SET = new Set<string>(['women', 'men']);
const LETTER_SIZE_SET = new Set<string>(APPAREL_LETTER_SIZES);

/** Route scope for a shop tab (always applied, not toggled in the panel). */
export function tabCategoryIds(tab: ShopTabId): readonly string[] {
  if (tab === 'all') return [];
  return [tab];
}

/**
 * The active tab from the route: `data.shopCategory` / `data.shopSubcategory` (the Bags page)
 * or the `/category/:slug` address, matched against the live category list.
 */
export function resolveShopTab(
  shopCategory: string | undefined,
  shopSubcategory: string | undefined,
  categories: readonly ShopCategorySource[],
): ShopTabId {
  const cat = (shopCategory ?? '').trim().toLowerCase();
  const sub = (shopSubcategory ?? '').trim().toLowerCase();
  if (sub === 'bags' || cat === 'bags') return 'accessories';
  return shopCategoryIdForSlug(cat, categories) ?? 'all';
}

export function parseShopFilterState(input: {
  readonly sort?: string | null;
  readonly category?: string | null;
  readonly brand?: string | null;
  readonly player?: string | null;
  readonly size?: string | null;
  readonly color?: string | null;
  readonly gender?: string | null;
  readonly newArrivals?: string | null;
  readonly onSale?: string | null;
  readonly inStock?: string | null;
  readonly page?: string | null;
  readonly bags?: string | null;
  /** Category ids the Category filter offers; any other `?category=` value is dropped. */
  readonly categoryIds: ReadonlySet<string>;
}): ShopFilterState {
  const sort =
    input.sort === 'newest' || input.sort === 'price-asc' || input.sort === 'price-desc'
      ? input.sort
      : 'featured';

  const categories = unique(parseList(input.category)).filter((id): id is ShopCategoryFilterId =>
    input.categoryIds.has(id),
  );
  if (isTruthyParam(input.bags) && !categories.includes('bags')) {
    categories.push('bags');
  }

  const colors = parseList(input.color).filter((id): id is ColorId => COLOR_ID_SET.has(id));
  const genders = parseList(input.gender).filter((id): id is ShopGenderFilterId => GENDER_ID_SET.has(id));

  return {
    sort,
    categories,
    brands: parseList(input.brand),
    players: unique(parseList(input.player).filter(isPlayerId)),
    sizes: parseList(input.size),
    colors,
    genders,
    newArrivals: isTruthyParam(input.newArrivals),
    onSale: isTruthyParam(input.onSale),
    inStock: isTruthyParam(input.inStock),
    page: Math.max(0, parseOptionalInt(input.page) ?? 0),
  };
}

export function shopFiltersToQueryParams(state: ShopFilterState): Record<string, string | null> {
  return {
    sort: state.sort === 'featured' ? null : state.sort,
    category: state.categories.length > 0 ? state.categories.join(',') : null,
    brand: state.brands.length > 0 ? state.brands.join(',') : null,
    player: state.players.length > 0 ? state.players.join(',') : null,
    size: state.sizes.length > 0 ? state.sizes.join(',') : null,
    color: state.colors.length > 0 ? state.colors.join(',') : null,
    gender: state.genders.length > 0 ? state.genders.join(',') : null,
    // The price filter was removed; clear any price range left in old links.
    priceMin: null,
    priceMax: null,
    newArrivals: state.newArrivals ? '1' : null,
    onSale: state.onSale ? '1' : null,
    inStock: state.inStock ? '1' : null,
    page: state.page > 0 ? String(state.page) : null,
  };
}

/**
 * Build Algolia browse options from the active tab + panel filters.
 * Tab scope is AND-ed; panel category checkboxes OR within the group.
 */
export function buildCatalogBrowseOptions(input: {
  readonly tab: ShopTabId;
  readonly filters: ShopFilterState;
  readonly hitsPerPage?: number;
  /** When bags is forced by the route (`/category/accessories/bags`). */
  readonly forceBags?: boolean;
  /** Current time; only read when the New arrivals filter is on. */
  readonly nowMs?: number;
  /** Only products in this offer (`?offer=<id>`, already checked by `parseOfferParam`). */
  readonly offerId?: string | null;
}): CatalogBrowseOptions {
  const { tab, filters, forceBags = false } = input;
  const filterParts: string[] = [];
  const facetFilters: (string | readonly string[])[] = [];

  if (input.offerId) {
    // `offerIds` is a filter-only attribute on each record (the live public offers it is in).
    filterParts.push(`offerIds:"${input.offerId}"`);
  }

  const scopedIds = [...tabCategoryIds(tab)];
  if (forceBags && !scopedIds.includes('bags')) {
    // Bags is under accessories: require bags leaf (implies accessories tree).
    scopedIds.length = 0;
    scopedIds.push('bags');
  }

  for (const id of scopedIds) {
    filterParts.push(`categoryIds:${id}`);
  }

  // Filter ids are category ids (`shopCategoryOptionsFrom()`); parsing already dropped unknown ones.
  const panelCategoryIds = filters.categories.filter((id) => /^[a-z0-9-]{1,120}$/.test(id));

  if (panelCategoryIds.length > 0 && scopedIds.length === 0) {
    // Parenthesize OR so AND with onSale/inStock/gender does not widen the match.
    filterParts.push(`(${panelCategoryIds.map((id) => `categoryIds:${id}`).join(' OR ')})`);
  } else if (panelCategoryIds.includes('bags') && tab === 'accessories' && !forceBags) {
    filterParts.push('categoryIds:bags');
  }

  if (filters.brands.length > 0) {
    facetFilters.push(filters.brands.map((name) => `brandName:${name}`));
  }

  if (filters.players.length > 0) {
    facetFilters.push(filters.players.map((id) => `players:${id}`));
  }

  if (filters.sizes.length > 0) {
    facetFilters.push(filters.sizes.map((size) => `sizes:${size}`));
  }

  if (filters.colors.length > 0) {
    facetFilters.push(filters.colors.map((color) => `colors:${color}`));
  }

  if (filters.genders.length > 0) {
    // Missing gender should still match (treated as unisex). Index may omit the field.
    const genderClause = [...filters.genders.map((g) => `gender:${g}`), 'gender:unisex'].join(' OR ');
    filterParts.push(`(${genderClause})`);
  }

  if (filters.newArrivals) {
    // Products staff marked as new arrivals (`newArrivalUntil` still ahead). Unlike the home
    // row this has no newest-products top-up; the home title links here only when the row
    // has marked products, and to Shop sorted by newest otherwise.
    filterParts.push(`newArrivalUntilMs > ${newArrivalCutoffMs(input.nowMs ?? Date.now())}`);
  }

  if (filters.onSale) {
    filterParts.push('onSale:true');
  }

  if (filters.inStock) {
    filterParts.push('inStock:true');
  }

  return {
    page: filters.page,
    hitsPerPage: input.hitsPerPage ?? 48,
    sort: filters.sort,
    filters: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
    facetFilters: facetFilters.length > 0 ? facetFilters : undefined,
    facets: ['brandName', 'players', 'colors', 'sizes', 'onSale', 'gender', 'hierarchicalCategories.lvl0'],
    disjunctiveFacets: ['brandName', 'players', 'colors', 'sizes'],
    maxValuesPerFacet: 50,
  };
}

const OFFER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The `?offer=` id when it looks like an offer id (letters, digits, `-`, `_`), else null. */
export function parseOfferParam(raw: string | null | undefined): string | null {
  const id = (raw ?? '').trim();
  return OFFER_ID.test(id) ? id : null;
}

/**
 * Start of the current hour. Staff save the New arrival end as 23:59:59.999 on the
 * chosen day, so an hour cutoff drops a product as soon as that day ends, while the
 * server render and the browser build the same Algolia request within the hour.
 */
export function newArrivalCutoffMs(nowMs: number): number {
  const hour = 60 * 60 * 1000;
  return Math.floor(nowMs / hour) * hour;
}

export function brandOptionsFromFacets(
  facets: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  selected: readonly string[] = [],
): readonly ShopBrandOption[] {
  const map = { ...(facets?.['brandName'] ?? {}) };
  for (const name of selected) {
    if (!(name in map)) map[name] = 0;
  }
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Players for the Player filter: only list players that have published products
 * (the index holds published products only), plus any already chosen.
 * Ids without a name in the list are left out.
 */
export function playerOptionsFromFacets(
  facets: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  players: readonly Player[],
  selected: readonly string[] = [],
): readonly ShopPlayerOption[] {
  const map = facets?.['players'] ?? {};
  return players
    .map((player) => ({ id: player.id, name: player.name, count: map[player.id] ?? 0 }))
    .filter((option) => option.count > 0 || selected.includes(option.id))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function sizeOptionsFromFacets(
  facets: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  selected: readonly string[] = [],
): readonly ShopSizeOption[] {
  const map = facets?.['sizes'] ?? {};
  const selectedSet = new Set(selected);
  const letter: ShopSizeOption[] = [];
  for (const label of APPAREL_LETTER_SIZES) {
    const count = map[label] ?? 0;
    if (count > 0 || selectedSet.has(label)) letter.push({ label, count });
  }
  // Sock / other apparel labels that appeared in facets (keep data labels as-is).
  const extras = Object.entries(map)
    .filter(([label, count]) => (count > 0 || selectedSet.has(label)) && !LETTER_SIZE_SET.has(label))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  for (const label of selected) {
    if (!LETTER_SIZE_SET.has(label) && !extras.some((e) => e.label === label) && !(label in map)) {
      extras.push({ label, count: 0 });
    }
  }
  return [...letter, ...extras];
}

export function colorOptionsFromFacets(
  facets: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  selected: readonly ColorId[],
): readonly ShopColorOption[] {
  const map = facets?.['colors'] ?? {};
  const selectedSet = new Set(selected);
  const options: ShopColorOption[] = [];

  for (const id of SHOP_COLOR_IDS) {
    const count = map[id] ?? 0;
    // Always surface Multi (and other shop colours) once any colour facet exists,
    // or when already selected — Multi may have 0 indexed products today.
    if (count > 0 || selectedSet.has(id) || (id === 'multi' && Object.keys(map).length > 0)) {
      const label = COLOR_PALETTE.find((entry) => entry.id === id)?.label ?? id;
      options.push({ id, label, count });
    }
  }
  return options;
}

export function genderFacetHasData(
  facets: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
): boolean {
  const map = facets?.['gender'];
  if (!map) return false;
  return Object.values(map).some((count) => count > 0);
}

export function hasApparelSizes(
  facets: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
): boolean {
  const map = facets?.['sizes'] ?? {};
  return APPAREL_LETTER_SIZES.some((size) => (map[size] ?? 0) > 0);
}

export function toggleListValue<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function filtersEqual(a: ShopFilterState, b: ShopFilterState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function resetShopFilters(keepSort = false): ShopFilterState {
  return {
    ...DEFAULT_SHOP_FILTERS,
    sort: keepSort ? DEFAULT_SHOP_FILTERS.sort : DEFAULT_SHOP_FILTERS.sort,
  };
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function unique(list: readonly string[]): string[] {
  return Array.from(new Set(list));
}

function parseOptionalInt(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function isTruthyParam(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
