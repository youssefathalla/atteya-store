import {
  BUILT_IN_CATEGORY_PAGE,
  type CategoryDetailsTitle,
  type CategorySizeChart,
} from '../catalog-taxonomy';

/** Most lines a product's details list can hold (same limit as the product form callables). */
export const MAX_DETAIL_LINES = 20;
/** Longest single details line. */
export const MAX_DETAIL_LINE = 200;

/** One category's saved product page settings (ATS-250): null = same as the parent; missing = built-in. */
export interface CategoryPageSetting {
  readonly sizeChart?: CategorySizeChart | null;
  readonly detailsTitle?: CategoryDetailsTitle | null;
}

/** Saved settings by category id; an id that is not here (not read, hidden or gone) uses the built-in default. */
export type CategoryPageSettings = Readonly<Record<string, CategoryPageSetting>>;

export interface CategoryPage {
  readonly sizeChart: CategorySizeChart;
  readonly detailsTitle: CategoryDetailsTitle;
}

/**
 * The size chart and details title a product page uses (ATS-250): the leaf category's value, else
 * its parent's; a category with no saved field uses `BUILT_IN_CATEGORY_PAGE`, a saved null skips
 * to the parent; nothing anywhere = no size chart and Specifications.
 */
export function categoryPageFor(
  product: { readonly categoryId: string; readonly categoryIds: readonly string[] },
  saved: CategoryPageSettings | null,
): CategoryPage {
  const chain = [product.categoryId, ...product.categoryIds.filter((id) => id !== product.categoryId)].filter(
    (id) => id.length > 0,
  );
  const pick = <K extends keyof CategoryPageSetting>(
    field: K,
  ): NonNullable<CategoryPageSetting[K]> | null => {
    for (const id of chain) {
      const raw = saved?.[id]?.[field];
      if (raw === null) continue;
      const value = raw ?? BUILT_IN_CATEGORY_PAGE[id]?.[field];
      if (value) return value as NonNullable<CategoryPageSetting[K]>;
    }
    return null;
  };
  return { sizeChart: pick('sizeChart') ?? 'none', detailsTitle: pick('detailsTitle') ?? 'specifications' };
}

export type ProductDetailsTitle = 'Materials' | 'Specifications';

/** Title of the product page section that lists `details`, from the category setting (`categoryPageFor`). */
export function productDetailsTitle(title: CategoryDetailsTitle): ProductDetailsTitle {
  return title === 'materials' ? 'Materials' : 'Specifications';
}

/** One details line without a leading bullet and with single spaces (same as the server). */
export function detailLine(value: string): string {
  return value
    .trim()
    .replace(/^•\s*/u, '')
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Textarea text (one fact per line) to the saved list: trimmed, bullets removed, blanks dropped. */
export function detailLinesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(detailLine)
    .filter((line) => line.length > 0);
}
