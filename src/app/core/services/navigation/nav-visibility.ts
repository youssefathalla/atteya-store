import type { NavCategory } from './nav.model';

/**
 * Drops a top-level category when its own path is an empty catalogue entry,
 * then drops empty links and columns. The saved navigation document is unchanged.
 */
export function visibleStorefrontCategories(
  categories: readonly NavCategory[],
  isEmpty: (path: string) => boolean,
): readonly NavCategory[] {
  const visible: NavCategory[] = [];
  for (const category of categories) {
    if (category.path && isEmpty(category.path)) continue;
    if (!category.megaMenu) {
      visible.push(category);
      continue;
    }
    const megaMenu = category.megaMenu.flatMap((column) => {
      const links = column.links.filter((link) => !isEmpty(link.path));
      if (links.length === 0) return [];
      return [{ ...column, links }];
    });
    if (megaMenu.length === 0 && !category.path) continue;
    visible.push({ ...category, megaMenu });
  }
  return visible;
}
