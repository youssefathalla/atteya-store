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
 * Category ids Navigation's "Shop with Filters…" can pick for `?category=`. Shop's own filter now
 * takes every shown category (`shopCategoryOptionsFrom()`, ATS-249); these built-in ones are
 * always among them. Navigation targets are ATS-246 / ATS-247.
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
  /** A running offer's Shop page (`/shop?offer=<id>`, ATS-267). */
  v.object({ kind: v.literal('offer'), id: idString }),
  /**
   * An Outside Link (`https://…`, ATS-267). Older saves may hold an address on our own site
   * here (the removed "Type an Address" box); `effectiveNavTarget()` turns those into a target.
   */
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

/** A running offer a link can open (admin only; the store never passes offers). */
export interface NavTargetOffer {
  readonly id: string;
  readonly name: string;
}

export interface NavTargetCatalog {
  readonly categories: readonly NavTargetEntry[];
  readonly brands: readonly NavTargetEntry[];
  /** Running public offers; when given, an offer link to anything else is reported `ended`. */
  readonly offers?: readonly NavTargetOffer[];
}

/**
 * Why a target can't be shown on the store: its category or brand is hidden or gone, or (admin
 * only) its offer isn't running now.
 */
export type NavTargetProblem = 'missing' | 'hidden' | 'ended';

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
    case 'offer': {
      const running = !catalog.offers || catalog.offers.some((offer) => offer.id === target.id);
      return { path: offerPath(target.id), problem: running ? null : 'ended' };
    }
    case 'url':
      return { path: target.url, problem: null };
  }
}

function offerPath(offerId: string): string {
  return `/shop?${new URLSearchParams({ offer: offerId }).toString()}`;
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
    case 'offer':
      return catalog.offers?.find((offer) => offer.id === target.id)?.name ?? null;
    case 'url':
      return null;
  }
}

/** Our own site: links to it are picked from the list, never typed as an Outside Link. */
const OWN_SITE_HOSTS: readonly string[] = ['atteyastore.com', 'www.atteyastore.com'];

/** True for atteyastore.com and the store's own hosted.app addresses (dev and prod). */
export function isOwnSiteHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (OWN_SITE_HOSTS.includes(host)) return true;
  return host.endsWith('.hosted.app') && /(^|[.-])atti?e?ya-store/.test(host);
}

const OUTSIDE_LINK_FORMAT = 'Enter the full address, starting with https://.';

/**
 * Why an Outside Link can't be saved (ATS-267), or null when it can: it must be a full `https://`
 * address on another site. Our own pages are picked from the list instead.
 */
export function outsideLinkProblem(raw: string): string | null {
  const value = raw.trim();
  if (!/^https:\/\//i.test(value) || /\s/.test(value)) return OUTSIDE_LINK_FORMAT;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return OUTSIDE_LINK_FORMAT;
  }
  if (!url.hostname.includes('.')) return OUTSIDE_LINK_FORMAT;
  if (isOwnSiteHost(url.hostname)) return 'Pick it from the list instead.';
  return null;
}

/** True when a saved address leaves our site (`https://…`), so it opens as a plain link. */
export function isOutsideAddress(path: string | null | undefined): boolean {
  return !!path && /^https?:\/\//i.test(path.trim());
}

function entryFromSlug(entries: readonly NavTargetEntry[], slug: string): NavTargetEntry | undefined {
  const key = slug.toLowerCase();
  return entries.find((item) => item.slug === key || item.id === key);
}

const SHOP_QUERY_KEYS = ['brand', 'player', 'category', 'gender', 'onSale', 'newArrivals'] as const;

/** A Shop address's query as filters; null when it holds anything the picker can't express. */
function shopFiltersFromQuery(
  params: URLSearchParams,
  catalog: NavTargetCatalog,
  category?: NavShopCategoryId,
): NavShopFilters | null {
  const filters: { -readonly [K in keyof NavShopFilters]: NavShopFilters[K] } = {};
  if (category) filters.category = category;
  const seen = new Set<string>();
  for (const [key, rawValue] of params) {
    const value = rawValue.trim();
    if (seen.has(key) || !(SHOP_QUERY_KEYS as readonly string[]).includes(key) || !value) return null;
    seen.add(key);
    switch (key) {
      case 'brand': {
        const lower = value.toLowerCase();
        const brand = catalog.brands.find(
          (item) => item.name.toLowerCase() === lower || item.slug === lower || item.id === lower,
        );
        if (!brand) return null;
        filters.brand = brand.id;
        break;
      }
      case 'player':
        filters.player = value;
        break;
      case 'category':
        if (filters.category || !(NAV_SHOP_CATEGORY_IDS as readonly string[]).includes(value)) return null;
        filters.category = value as NavShopCategoryId;
        break;
      case 'gender':
        if (!(NAV_SHOP_GENDERS as readonly string[]).includes(value)) return null;
        filters.gender = value as NavShopGender;
        break;
      case 'onSale':
        if (value !== '1' && value !== 'true') return null;
        filters.onSale = true;
        break;
      case 'newArrivals':
        if (value !== '1' && value !== 'true') return null;
        filters.newArrivals = true;
        break;
    }
  }
  return filters;
}

/**
 * The target an address points at (ATS-246, ATS-267): a category, brand or page address
 * (`/category/socks`, `/brand/nox`, `/shop?onSale=1`), an offer (`/shop?offer=<id>`), Shop with
 * filters (`/shop?brand=Nox&gender=women`, `/category/apparel?gender=men`), or an Outside Link for
 * a full `https://` address on another site. Null when it can't be matched: staff pick it again.
 */
export function navTargetFromPath(rawPath: string, catalog: NavTargetCatalog): NavTarget | null {
  let address = rawPath.trim();
  if (!address) return null;
  if (/^https?:\/\//i.test(address)) {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return null;
    }
    if (!isOwnSiteHost(url.hostname)) return { kind: 'url', url: address };
    address = `${url.pathname}${url.search}`;
  }
  if (!address.startsWith('/') || address.startsWith('//') || address.includes('#')) return null;
  const queryAt = address.indexOf('?');
  let pathname = queryAt === -1 ? address : address.slice(0, queryAt);
  const query = queryAt === -1 ? '' : address.slice(queryAt + 1);
  while (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  const params = new URLSearchParams(query);
  const hasQuery = [...params.keys()].length > 0;

  const exact = hasQuery ? `${pathname}?${params.toString()}` : pathname;
  const page = NAV_TARGET_PAGES.find((id) => PAGE_PATHS[id] === exact);
  if (page) return { kind: 'page', page };

  const categorySegments = pathname.startsWith('/category/') ? pathname.slice(10).split('/') : null;
  if (categorySegments) {
    if (categorySegments.length > 2 || !categorySegments.every((part) => /^[a-z0-9-]{1,120}$/i.test(part))) {
      return null;
    }
    const slug = categorySegments.at(-1) ?? '';
    const entry = entryFromSlug(catalog.categories, slug);
    if (!entry) return null;
    if (!hasQuery) return { kind: 'category', id: entry.id };
    // A top-level Shop category with filters (`/category/apparel?gender=men`) is Shop with filters.
    if (!(NAV_SHOP_CATEGORY_IDS as readonly string[]).includes(entry.id)) return null;
    const filters = shopFiltersFromQuery(params, catalog, entry.id as NavShopCategoryId);
    return filters ? { kind: 'shop', filters } : null;
  }

  const brandSlug = /^\/brand\/([a-z0-9-]+)$/i.exec(pathname)?.[1];
  if (brandSlug) {
    const entry = entryFromSlug(catalog.brands, brandSlug);
    return entry && !hasQuery ? { kind: 'brand', id: entry.id } : null;
  }

  if (pathname !== '/shop') return null;
  const offer = params.get('offer')?.trim();
  if (offer) {
    return [...params.keys()].length === 1 && offer.length <= 120 ? { kind: 'offer', id: offer } : null;
  }
  const filters = shopFiltersFromQuery(params, catalog);
  return filters ? { kind: 'shop', filters } : null;
}

/**
 * What a saved link points at, for the editors and the save (ATS-267): its target, or the target
 * its typed address names (an old link saved before targets, or with the removed "Type an
 * Address" box). An Outside Link stays as it is. Null when the address can't be matched (staff
 * pick where it goes) or there is nothing at all.
 */
export function effectiveNavTarget(
  target: NavTarget | undefined | null,
  path: string | undefined | null,
  catalog: NavTargetCatalog,
): NavTarget | null {
  if (target && target.kind !== 'url') return target;
  if (target?.kind === 'url' && !target.url.trim().startsWith('/')) return target;
  const raw = (target?.kind === 'url' ? target.url : path)?.trim() ?? '';
  return raw ? navTargetFromPath(raw, catalog) : null;
}
