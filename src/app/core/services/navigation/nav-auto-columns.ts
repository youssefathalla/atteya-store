import * as v from 'valibot';
import type { MegaMenuLink, NavCategory } from './nav.model';
import type { ShareImage } from '@core/services/products/utils/shop-categories';

/**
 * Navigation columns that fill themselves (ATS-247): a column with `auto` shows the store's
 * brands or a category's sub-categories instead of its own links, so a brand or sub-category
 * staff add in Categories & Brands appears in the menu with no Navigation edit. The column's
 * own `links` stay saved, so turning Fill Automatically off brings them back.
 */

/** "Show at most" in the editor. */
export const NAV_AUTO_DEFAULT_LIMIT = 8;
export const NAV_AUTO_MAX_LIMIT = 20;

export const NAV_AUTO_KINDS = ['brands', 'newest-brands', 'children'] as const;
export type NavAutoKind = (typeof NAV_AUTO_KINDS)[number];

/** How each kind is named in the editor ("Sub-categories of …" is followed by the category). */
export const NAV_AUTO_KIND_LABELS: Readonly<Record<NavAutoKind, string>> = {
  brands: 'All Brands',
  'newest-brands': 'Newest Brands',
  children: 'Sub-categories of …',
};

const limitSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(NAV_AUTO_MAX_LIMIT));
const idString = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));

export const NavAutoColumnSchema = v.variant('kind', [
  /** Every shown brand with products, in the Categories & Brands order. */
  v.object({ kind: v.literal('brands'), limit: v.optional(limitSchema) }),
  /** The shown brands with products, newest first. */
  v.object({ kind: v.literal('newest-brands'), limit: limitSchema }),
  /** The shown sub-categories (with products) of one category, in their order. */
  v.object({ kind: v.literal('children'), categoryId: idString }),
]);

export type NavAutoColumn = v.InferOutput<typeof NavAutoColumnSchema>;

/** A published brand as an auto column needs it. */
export interface NavAutoBrand {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sortOrder: number;
  /** When the brand was added; 0 when unknown. */
  readonly createdAtMs: number;
  /** The brand's logo, shown when someone shares the brand's link (ATS-263); missing = none. */
  readonly logo?: ShareImage;
}

/** A published category as an auto column needs it. */
export interface NavAutoCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
}

export interface NavAutoSources {
  /** Published brands only. */
  readonly brands: readonly NavAutoBrand[];
  /** Published categories only. */
  readonly categories: readonly NavAutoCategory[];
}

/** True when the store has nothing published at that address (from `settings/catalog`). */
export type NavPathIsEmpty = (path: string) => boolean;

export interface NavAutoOptions {
  /** Ignore "Show at most" (the Brands page lists every brand of a brand column). */
  readonly noLimit?: boolean;
}

/** The "Show at most" number for an auto column (sub-categories always stop at the max). */
export function navAutoLimit(auto: NavAutoColumn): number {
  if (auto.kind === 'children') return NAV_AUTO_MAX_LIMIT;
  return auto.limit ?? NAV_AUTO_DEFAULT_LIMIT;
}

function bySortOrder<T extends { readonly sortOrder: number; readonly name: string }>(
  left: T,
  right: T,
): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

function brandLink(brand: NavAutoBrand): MegaMenuLink {
  return {
    label: brand.name,
    path: `/brand/${brand.slug}`,
    target: { kind: 'brand', id: brand.id },
    isBrand: true,
  };
}

function categoryLink(category: NavAutoCategory): MegaMenuLink {
  return {
    label: category.name,
    path: `/category/${category.slug}`,
    target: { kind: 'category', id: category.id },
  };
}

/**
 * The links an auto column shows now: the same link shape as a picked target (ATS-246), with
 * empty brands and categories left out before "Show at most" is applied.
 */
export function navAutoColumnLinks(
  auto: NavAutoColumn,
  sources: NavAutoSources,
  isEmpty: NavPathIsEmpty,
  options: NavAutoOptions = {},
): MegaMenuLink[] {
  const limit = options.noLimit ? Number.POSITIVE_INFINITY : navAutoLimit(auto);
  switch (auto.kind) {
    case 'brands':
      return [...sources.brands]
        .sort(bySortOrder)
        .map(brandLink)
        .filter((link) => !isEmpty(link.path))
        .slice(0, limit);
    case 'newest-brands':
      return [...sources.brands]
        .sort((left, right) => right.createdAtMs - left.createdAtMs || bySortOrder(left, right))
        .map(brandLink)
        .filter((link) => !isEmpty(link.path))
        .slice(0, limit);
    case 'children':
      // A hidden or deleted category shows none of its sub-categories.
      if (!sources.categories.some((category) => category.id === auto.categoryId)) return [];
      return sources.categories
        .filter((category) => category.parentId === auto.categoryId)
        .sort(bySortOrder)
        .map(categoryLink)
        .filter((link) => !isEmpty(link.path))
        .slice(0, limit);
  }
}

/** True when a menu has an auto column that lists brands (the server reads the brands for it). */
export function navNeedsBrands(categories: readonly NavCategory[]): boolean {
  return categories.some((category) =>
    (category.megaMenu ?? []).some(
      (column) => column.auto?.kind === 'brands' || column.auto?.kind === 'newest-brands',
    ),
  );
}

/**
 * Replaces each auto column's links with what it shows now. The saved navigation document is
 * unchanged; other columns are returned as they are.
 */
export function expandAutoColumns(
  categories: readonly NavCategory[],
  sources: NavAutoSources,
  isEmpty: NavPathIsEmpty,
  options: NavAutoOptions = {},
): readonly NavCategory[] {
  const hasAuto = categories.some((category) => category.megaMenu?.some((column) => column.auto));
  if (!hasAuto) return categories;
  return categories.map((category) => {
    if (!category.megaMenu?.some((column) => column.auto)) return category;
    return {
      ...category,
      megaMenu: category.megaMenu.map((column) =>
        column.auto
          ? { ...column, links: navAutoColumnLinks(column.auto, sources, isEmpty, options) }
          : column,
      ),
    };
  });
}

/** Milliseconds from a Firestore Timestamp, a Date, an ISO string or a number; 0 when unknown. */
export function timeToMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const ms = Number(toMillis.call(value));
      return Number.isFinite(ms) ? ms : 0;
    }
  }
  return 0;
}
