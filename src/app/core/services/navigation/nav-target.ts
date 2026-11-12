import * as v from 'valibot';

/**
 * What a navigation link or menu points at (ATS-246). The store builds the address from it,
 * so a link to a category or brand follows that category's slug and is left out of the
 * menus when the category or brand is hidden or deleted. `path` is still saved next to it.
 */

/** Pages a link can open without naming a category or brand. */
export const NAV_TARGET_PAGES = ['shop', 'sale', 'new-arrivals', 'brands'] as const;
export type NavTargetPage = (typeof NAV_TARGET_PAGES)[number];

export const NAV_TARGET_PAGE_LABELS: Readonly<Record<NavTargetPage, string>> = {
  shop: 'Shop All',
  sale: 'Sale',
  'new-arrivals': 'New Arrivals',
  brands: 'All Brands',
};

const PAGE_PATHS: Readonly<Record<NavTargetPage, string>> = {
  shop: '/shop',
  sale: '/shop?onSale=1',
  'new-arrivals': '/shop?newArrivals=1',
  brands: '/brands',
};

/**
 * Shop's own category filter ids (`?category=`). Keep equal to `SHOP_CATEGORY_OPTIONS`
 * in `features/shop/models/shop.model.ts`.
 */
export const NAV_SHOP_CATEGORY_IDS = ['apparel', 'accessories', 'rackets', 'bags'] as const;
export type NavShopCategoryId = (typeof NAV_SHOP_CATEGORY_IDS)[number];

export const NAV_SHOP_CATEGORY_LABELS: Readonly<Record<NavShopCategoryId, string>> = {
  apparel: 'Apparel',
  accessories: 'Accessories',
  rackets: 'Padel',
  bags: 'Bags',
};

export const NAV_SHOP_GENDERS = ['women', 'men'] as const;
export type NavShopGender = (typeof NAV_SHOP_GENDERS)[number];

const idString = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));

export const NavShopFiltersSchema = v.object({
  /** Brand document id; the address uses the brand's name, like Shop's Brand filter. */
  brand: v.optional(idString),
  /** Player id from `settings/players`. */
  player: v.optional(idString),
  category: v.optional(v.picklist(NAV_SHOP_CATEGORY_IDS)),
  gender: v.optional(v.picklist(NAV_SHOP_GENDERS)),
  onSale: v.optional(v.boolean()),
  newArrivals: v.optional(v.boolean()),
});

export const NavTargetSchema = v.variant('kind', [
  v.object({ kind: v.literal('category'), id: idString }),
  v.object({ kind: v.literal('brand'), id: idString }),
  v.object({ kind: v.literal('page'), page: v.picklist(NAV_TARGET_PAGES) }),
  v.object({ kind: v.literal('shop'), filters: NavShopFiltersSchema }),
  v.object({ kind: v.literal('url'), url: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)) }),
]);

export type NavTarget = v.InferOutput<typeof NavTargetSchema>;
export type NavShopFilters = v.InferOutput<typeof NavShopFiltersSchema>;

/** A category or brand as the address builder sees it. */
export interface NavTargetEntry {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  /** False = hidden on the store. */
  readonly published: boolean;
}

export interface NavTargetCatalog {
  readonly categories: readonly NavTargetEntry[];
  readonly brands: readonly NavTargetEntry[];
}

/** Why a target can't be shown on the store: its category or brand is hidden or gone. */
export type NavTargetProblem = 'missing' | 'hidden';

export interface ResolvedNavTarget {
  /** The store address, or null when the category or brand no longer exists. */
  readonly path: string | null;
  readonly problem: NavTargetProblem | null;
}

function find(entries: readonly NavTargetEntry[], id: string): NavTargetEntry | null {
  return entries.find((entry) => entry.id === id) ?? null;
}

function entryResult(
  entry: NavTargetEntry | null,
  path: (entry: NavTargetEntry) => string,
): ResolvedNavTarget {
  if (!entry) return { path: null, problem: 'missing' };
  return { path: path(entry), problem: entry.published ? null : 'hidden' };
}

function shopResult(filters: NavShopFilters, catalog: NavTargetCatalog): ResolvedNavTarget {
  const params = new URLSearchParams();
  let problem: NavTargetProblem | null = null;
  if (filters.category && (NAV_SHOP_CATEGORY_IDS as readonly string[]).includes(filters.category)) {
    params.set('category', filters.category);
  }
  if (filters.brand) {
    const brand = find(catalog.brands, filters.brand);
    if (!brand) return { path: null, problem: 'missing' };
    if (!brand.published) problem = 'hidden';
    params.set('brand', brand.name);
  }
  if (filters.player) params.set('player', filters.player);
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.onSale) params.set('onSale', '1');
  if (filters.newArrivals) params.set('newArrivals', '1');
  const query = params.toString();
  return { path: query ? `/shop?${query}` : '/shop', problem };
}

/** The store address for a target, and whether its category or brand is hidden or missing. */
export function resolveNavTarget(target: NavTarget, catalog: NavTargetCatalog): ResolvedNavTarget {
  switch (target.kind) {
    case 'category':
      return entryResult(find(catalog.categories, target.id), (entry) => `/category/${entry.slug}`);
    case 'brand':
      return entryResult(find(catalog.brands, target.id), (entry) => `/brand/${entry.slug}`);
    case 'page':
      return { path: PAGE_PATHS[target.page], problem: null };
    case 'shop':
      return shopResult(target.filters, catalog);
    case 'url':
      return { path: target.url, problem: null };
  }
}

/** The store address for a target; null when its category or brand no longer exists. */
export function navTargetPath(target: NavTarget, catalog: NavTargetCatalog): string | null {
  return resolveNavTarget(target, catalog).path;
}

/** A plain name for the target ("Socks", "Nox", "Sale"); used to fill an empty label. */
export function navTargetName(target: NavTarget, catalog: NavTargetCatalog): string | null {
  switch (target.kind) {
    case 'category':
      return find(catalog.categories, target.id)?.name ?? null;
    case 'brand':
      return find(catalog.brands, target.id)?.name ?? null;
    case 'page':
      return NAV_TARGET_PAGE_LABELS[target.page];
    case 'shop': {
      const { filters } = target;
      const brand = filters.brand ? find(catalog.brands, filters.brand)?.name : undefined;
      const category = filters.category ? NAV_SHOP_CATEGORY_LABELS[filters.category] : undefined;
      const parts = [brand, category].filter((part): part is string => !!part);
      if (filters.onSale) parts.push('on Sale');
      return parts.length > 0 ? parts.join(' ') : null;
    }
    case 'url':
      return null;
  }
}

/**
 * The target an address points at, when it is exactly a category, brand or page address
 * (`/category/socks`, `/brand/nox`, `/shop?onSale=1`); any other address stays a typed address.
 */
export function navTargetFromPath(rawPath: string, catalog: NavTargetCatalog): NavTarget | null {
  const path = rawPath.trim();
  if (!path) return null;
  const page = NAV_TARGET_PAGES.find((id) => PAGE_PATHS[id] === path);
  if (page) return { kind: 'page', page };
  const category = /^\/category\/([a-z0-9-]+)$/i.exec(path)?.[1]?.toLowerCase();
  if (category) {
    const entry = catalog.categories.find((item) => item.slug === category || item.id === category);
    if (entry) return { kind: 'category', id: entry.id };
  }
  const brand = /^\/brand\/([a-z0-9-]+)$/i.exec(path)?.[1]?.toLowerCase();
  if (brand) {
    const entry = catalog.brands.find((item) => item.slug === brand || item.id === brand);
    if (entry) return { kind: 'brand', id: entry.id };
  }
  return { kind: 'url', url: path };
}
