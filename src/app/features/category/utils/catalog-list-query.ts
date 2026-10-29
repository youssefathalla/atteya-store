import type { ProductListQuery } from '@core/services/products/product.model';

/** Pseudo-slugs that are navigation destinations, not Firestore category docs. */
const PSEUDO_CATEGORY_SLUGS = new Set(['all', 'sale']);

export type CatalogListKind = 'all' | 'category' | 'brand' | 'unsupported';

export interface CatalogListParams {
  readonly kind: CatalogListKind;
  /** Firestore filter id when kind is category or brand. */
  readonly filterId: string | null;
}

/**
 * Resolve which published-product query a category/brand route should run.
 * `sale` and unknown merchandising sub-slugs (new, best-sellers, …) are unsupported
 * until dedicated filters exist — the page shows an empty state, not a placeholder.
 */
export function resolveCatalogListParams(input: {
  readonly isBrand: boolean;
  readonly slug: string;
  readonly subSlug: string | undefined;
  readonly categoryId: string | null;
  readonly brandId: string | null;
}): CatalogListParams {
  const slug = input.slug.trim().toLowerCase();
  const sub = input.subSlug?.trim().toLowerCase();

  if (input.isBrand) {
    return input.brandId
      ? { kind: 'brand', filterId: input.brandId }
      : { kind: 'unsupported', filterId: null };
  }

  const target = sub || slug;
  if (target === 'all' && !sub) {
    return { kind: 'all', filterId: null };
  }

  if (PSEUDO_CATEGORY_SLUGS.has(target) || (sub && PSEUDO_CATEGORY_SLUGS.has(slug) && !input.categoryId)) {
    return { kind: 'unsupported', filterId: null };
  }

  if (input.categoryId) {
    return { kind: 'category', filterId: input.categoryId };
  }

  // Known seed/live id used as the path segment even before categories/* hydrates.
  if (target && !isMerchandisingSegment(target)) {
    return { kind: 'category', filterId: target };
  }

  return { kind: 'unsupported', filterId: null };
}

export function toProductListQuery(
  params: CatalogListParams,
  pageSize: number,
): ProductListQuery | null {
  if (params.kind === 'unsupported') return null;
  if (params.kind === 'all') return { limit: pageSize };
  if (params.kind === 'category' && params.filterId) {
    return { categoryId: params.filterId, limit: pageSize };
  }
  if (params.kind === 'brand' && params.filterId) {
    return { brandId: params.filterId, limit: pageSize };
  }
  return null;
}

function isMerchandisingSegment(segment: string): boolean {
  return (
    segment === 'new' ||
    segment === 'best-sellers' ||
    segment === 'pro' ||
    segment === 'teams' ||
    segment === 'outlet' ||
    segment === 'flash'
  );
}
