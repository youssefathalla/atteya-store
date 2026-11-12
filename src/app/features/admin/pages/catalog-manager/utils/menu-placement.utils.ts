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

/**
 * The top menu that opens a category (ATS-264): its target is that category, or its typed or
 * saved address is the category's `/category/…` address. Null when no menu opens it.
 */
export function menuForCategory(
  categories: readonly NavCategory[],
  category: { readonly id: string; readonly path: string },
): NavCategory | null {
  const addresses = new Set([`/category/${category.path}`, `/category/${category.id}`]);
  return (
    categories.find(
      (menu) =>
        (menu.target?.kind === 'category' && menu.target.id === category.id) ||
        (menu.target?.kind === 'url' && addresses.has(menu.target.url)) ||
        (!menu.target && !!menu.path && addresses.has(menu.path)),
    ) ?? null
  );
}

/** The top menu that opens the Brands page, or null (ATS-264). */
export function menuForBrands(categories: readonly NavCategory[]): NavCategory | null {
  return (
    categories.find(
      (menu) =>
        (menu.target?.kind === 'page' && menu.target.page === 'brands') ||
        (menu.target?.kind === 'url' && menu.target.url === '/brands') ||
        (!menu.target && menu.path === '/brands'),
    ) ?? null
  );
}

/** A menu name as staff read it in a sentence: "APPAREL" → "Apparel", "BAGS & GEAR" → "Bags & Gear". */
export function menuDisplayName(label: string): string {
  const text = label.replace(/\s+/g, ' ').trim();
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** A category or brand being deleted, as the menu refers to it (ATS-265). */
export interface DeletedMenuItem {
  readonly kind: 'category' | 'brand';
  readonly id: string;
  /** Its store address: `/category/<path>` or `/brand/<slug>`. */
  readonly address: string;
}

/**
 * The navigation with every reference to a deleted category or brand taken out (ATS-265): links
 * that open it, a menu name that opens it (the menu then only opens its dropdown, or goes when
 * nothing is left in it), and a "Sub-categories of" column for it (switched back to its own
 * links). `changed` is false when the menu never mentioned it, so nothing needs saving.
 */
export function removeFromMenu(
  categories: readonly NavCategory[],
  item: DeletedMenuItem,
): { readonly next: readonly NavCategory[]; readonly changed: boolean } {
  let changed = false;
  const opensIt = (target: NavTarget | undefined, path: string | undefined): boolean => {
    if (target?.kind === item.kind && 'id' in target && target.id === item.id) return true;
    // A typed address (or an older link with no target) that is exactly its address.
    if (target && target.kind !== 'url') return false;
    const address = target?.kind === 'url' ? target.url : path;
    return !!address && sameAddress(address, item.address);
  };

  const next = categories.flatMap((category): NavCategory[] => {
    const megaMenu = category.megaMenu?.map((column) => {
      let links = column.links;
      if (links.some((link) => opensIt(link.target, link.path))) {
        changed = true;
        links = links.filter((link) => !opensIt(link.target, link.path));
      }
      if (
        item.kind === 'category' &&
        column.auto?.kind === 'children' &&
        column.auto.categoryId === item.id
      ) {
        changed = true;
        const manual = { ...column, links };
        delete manual.auto;
        return manual;
      }
      return links === column.links ? column : { ...column, links };
    });
    let result: NavCategory = megaMenu ? { ...category, megaMenu } : category;
    if (opensIt(category.target, category.path)) {
      changed = true;
      result = { ...result };
      delete result.target;
      delete result.path;
      const hasLinks = (result.megaMenu ?? []).some((column) => column.links.length > 0 || !!column.auto);
      if (!hasLinks) return [];
    }
    return [result];
  });
  return { next: changed ? next : categories, changed };
}

function sameAddress(left: string, right: string): boolean {
  const clean = (value: string): string =>
    (value.split(/[?#]/, 1)[0] ?? '').replace(/\/+$/, '').toLowerCase();
  return clean(left) === clean(right);
}
