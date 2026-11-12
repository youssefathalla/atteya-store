import type { MegaMenuLink, NavCategory } from '@core/services/navigation/nav.model';
import type { NavTarget } from '@core/services/navigation/nav-target';

/**
 * "Add to the Menu" in the Categories & Brands dialogs (ATS-248): picks a top menu and one of its
 * columns from `settings/navigation`, and builds the saved navigation with the new link added at
 * the end of that column. Columns that fill themselves (ATS-247) are never offered.
 */

export interface MenuColumnOption {
  /** Index in the menu's `megaMenu`; what `addLinkToMenu` takes. */
  readonly index: number;
  readonly title: string;
}

export interface MenuOption {
  readonly id: string;
  readonly label: string;
  /** Columns that hold their own links (not Fill Automatically). */
  readonly columns: readonly MenuColumnOption[];
  /** True when the menu also has a column that fills itself, so a note can say so. */
  readonly hasAutoColumn: boolean;
}

/** Top menus that have a dropdown (at least one column), with the columns a link can be added to. */
export function menuOptions(categories: readonly NavCategory[]): readonly MenuOption[] {
  return categories
    .filter((category) => (category.megaMenu?.length ?? 0) > 0)
    .map((category) => {
      const columns = category.megaMenu ?? [];
      return {
        id: category.id,
        label: category.label,
        columns: columns.flatMap((column, index) =>
          column.auto ? [] : [{ index, title: column.title?.trim() || `Column ${index + 1}` }],
        ),
        hasAutoColumn: columns.some((column) => !!column.auto),
      };
    });
}

/**
 * The menu that already lists new sub-categories of `parentId` by itself: a column set to Fill
 * Automatically with "Sub-categories of" that category. Null when there is none.
 */
export function menuFillingSubCategories(
  categories: readonly NavCategory[],
  parentId: string,
): { readonly label: string } | null {
  for (const category of categories) {
    const fills = category.megaMenu?.some(
      (column) => column.auto?.kind === 'children' && column.auto.categoryId === parentId,
    );
    if (fills) return { label: category.label };
  }
  return null;
}

/** True when a menu has a column that lists every brand (or the newest brands) by itself. */
export function menuFillsBrands(categories: readonly NavCategory[]): boolean {
  return categories.some((category) =>
    category.megaMenu?.some(
      (column) => column.auto?.kind === 'brands' || column.auto?.kind === 'newest-brands',
    ),
  );
}

export interface NewMenuLink {
  readonly label: string;
  readonly path: string;
  readonly target: Extract<NavTarget, { kind: 'category' | 'brand' }>;
  readonly isBrand?: boolean;
}

/**
 * The navigation with the link added at the end of one column, or null when that menu or column
 * is gone or fills itself (nothing is changed then).
 */
export function addLinkToMenu(
  categories: readonly NavCategory[],
  menuId: string,
  columnIndex: number,
  link: NewMenuLink,
): readonly NavCategory[] | null {
  const menu = categories.find((category) => category.id === menuId);
  const column = menu?.megaMenu?.[columnIndex];
  if (!menu || !column || column.auto) return null;
  // Already there (a slow save that landed after it timed out, then a retry): add nothing twice.
  const already = column.links.some(
    (item) =>
      item.target?.kind === link.target.kind && 'id' in item.target && item.target.id === link.target.id,
  );
  if (already) return categories;

  const added: MegaMenuLink = {
    label: link.label,
    path: link.path,
    target: link.target,
    ...(link.isBrand ? { isBrand: true } : {}),
  };
  return categories.map((category) =>
    category.id === menuId
      ? {
          ...category,
          megaMenu: (category.megaMenu ?? []).map((item, index) =>
            index === columnIndex ? { ...item, links: [...item.links, added] } : item,
          ),
        }
      : category,
  );
}
