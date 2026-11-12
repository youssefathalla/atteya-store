import type { MegaMenuLink, NavCategory } from './nav.model';
import { resolveNavTarget, type NavTarget, type NavTargetCatalog } from './nav-target';

/**
 * The store address for a saved target, or null to leave the link out (its category or
 * brand is hidden or gone, or its offer isn't running). A typed address (`url`) is kept as typed. Without a catalog
 * (on the server, or before the published categories and brands load) the saved `path`
 * is used, so the server HTML and the first browser render match.
 */
export function storefrontTargetPath(
  target: NavTarget | undefined,
  savedPath: string | undefined,
  catalog: NavTargetCatalog | null,
): string | null | undefined {
  if (!target || !catalog) return savedPath;
  if (target.kind === 'url') return target.url;
  const { path, problem } = resolveNavTarget(target, catalog);
  // An offer link whose offer isn't running is left out (only when the running offers are known).
  return problem === 'ended' ? null : path;
}

/**
 * Builds each link's address from its target with the published categories and brands
 * (only published ones are passed in, so a hidden one counts as missing) and leaves out
 * links whose target can't be shown. A menu whose own target is gone keeps its links and
 * only opens the menu. The saved navigation document is unchanged.
 */
export function resolveStorefrontTargets(
  categories: readonly NavCategory[],
  catalog: NavTargetCatalog | null,
): readonly NavCategory[] {
  if (!catalog) return categories;
  return categories.map((category) => {
    const path = storefrontTargetPath(category.target, category.path, catalog);
    const megaMenu = category.megaMenu?.map((column) => ({
      ...column,
      links: column.links.flatMap((link): MegaMenuLink[] => {
        const linkPath = storefrontTargetPath(link.target, link.path, catalog);
        return linkPath ? [{ ...link, path: linkPath }] : [];
      }),
    }));
    const resolved: NavCategory = { ...category, ...(megaMenu ? { megaMenu } : {}) };
    if (path) resolved.path = path;
    else delete resolved.path;
    return resolved;
  });
}

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
      if (category.path) visible.push(category);
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
