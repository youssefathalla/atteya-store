/** What a category or brand address shows (ATS-268). */
export type CatalogPageDecision =
  | { readonly kind: 'ok' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'redirect'; readonly path: string };

/** A shown category, as the published list has it. */
export interface PublishedCategoryRef {
  readonly id: string;
  readonly slug: string;
  readonly parentId: string | null;
}

/** A shown brand, as the published list has it. */
export interface PublishedBrandRef {
  readonly id: string;
  readonly slug: string;
}

/** `settings/catalog`: live product counts per id, kept for every category and brand doc, shown or hidden. */
export interface CatalogCountsRef {
  readonly categories: Readonly<Record<string, number>>;
  readonly brands: Readonly<Record<string, number>>;
}

const OK: CatalogPageDecision = { kind: 'ok' };
const MISSING: CatalogPageDecision = { kind: 'missing' };
const SHOP: CatalogPageDecision = { kind: 'redirect', path: '/shop' };

/** Addresses that aren't category docs (`/category/all`, `/category/sale`, merchandising sub-pages). */
const PSEUDO_SEGMENTS = new Set(['all', 'sale']);

/**
 * Category page (`/category/<slug>` or `/category/<slug>/<sub>`): a shown category with live products
 * opens; an empty or hidden sub-category goes to its main category; an empty or hidden main category
 * goes to Shop; an address that is no category at all (deleted, mistyped) is Page Not Found.
 * Without counts nothing is decided, so a slow `settings/catalog` never sends anyone away.
 */
export function decideCategoryPage(input: {
  readonly slug: string;
  readonly subSlug: string | null;
  readonly published: readonly PublishedCategoryRef[];
  readonly counts: CatalogCountsRef | null;
  readonly deletedBuiltInIds: ReadonlySet<string>;
}): CatalogPageDecision {
  const slug = input.slug.trim().toLowerCase();
  const sub = input.subSlug?.trim().toLowerCase() || null;
  const target = sub ?? slug;
  if (!target || PSEUDO_SEGMENTS.has(target) || PSEUDO_SEGMENTS.has(slug) || isMerchandisingSegment(target)) {
    return OK;
  }
  const counts = input.counts;
  if (!counts) return OK;

  const bySlug = (value: string) =>
    input.published.find((item) => item.slug.toLowerCase() === value || item.id.toLowerCase() === value);
  const parentPath = (): CatalogPageDecision => {
    if (sub) return { kind: 'redirect', path: `/category/${slug}` };
    return SHOP;
  };

  const found = bySlug(target);
  if (found) {
    const count = counts.categories[found.id];
    if (count === undefined || count > 0) return OK;
    if (sub) return parentPath();
    // `/category/<sub-category>` on its own: its main category, when that is shown.
    const parent = found.parentId ? input.published.find((item) => item.id === found.parentId) : undefined;
    return parent ? { kind: 'redirect', path: `/category/${parent.slug}` } : SHOP;
  }

  // Not shown: hidden when it still has a count (every category doc has one), else gone.
  const hidden = Object.hasOwn(counts.categories, target) && !input.deletedBuiltInIds.has(target);
  return hidden ? parentPath() : MISSING;
}

/** Brand page (`/brand/<slug>`): shown with live products opens; empty or hidden goes to Shop; gone is Page Not Found. */
export function decideBrandPage(input: {
  readonly slug: string;
  /** Null when the shown brands couldn't be read: nothing is decided then. */
  readonly published: readonly PublishedBrandRef[] | null;
  readonly counts: CatalogCountsRef | null;
  readonly deletedBuiltInIds: ReadonlySet<string>;
}): CatalogPageDecision {
  const slug = input.slug.trim().toLowerCase();
  const counts = input.counts;
  if (!slug || !counts || !input.published) return OK;

  const found = input.published.find(
    (item) => item.slug.toLowerCase() === slug || item.id.toLowerCase() === slug,
  );
  if (found) {
    const count = counts.brands[found.id];
    return count === undefined || count > 0 ? OK : SHOP;
  }
  const hidden = Object.hasOwn(counts.brands, slug) && !input.deletedBuiltInIds.has(slug);
  return hidden ? SHOP : MISSING;
}

/** Merchandising sub-pages (`/category/x/new`, …) that have no filter yet; they keep their empty state. */
export function isMerchandisingSegment(segment: string): boolean {
  return (
    segment === 'new' ||
    segment === 'best-sellers' ||
    segment === 'pro' ||
    segment === 'teams' ||
    segment === 'outlet' ||
    segment === 'flash'
  );
}
