import {
  resolveNavTarget,
  type MegaMenuLink,
  type NavCategory,
  type NavTarget,
  type NavTargetCatalog,
} from '@core/services/navigation';
import { normalizePath } from './navigation-manager.utils';

/**
 * The address saved next to a target: rebuilt from the target when its category or brand
 * still exists, the typed address (tidied) for `url`, else the address already saved.
 */
function pathFor(target: NavTarget | undefined, saved: string, catalog: NavTargetCatalog | null): string {
  if (target?.kind === 'url') return normalizePath(target.url);
  if (target && catalog) return resolveNavTarget(target, catalog).path ?? saved;
  return saved ? normalizePath(saved) : '';
}

function tidyTarget(target: NavTarget | undefined): NavTarget | undefined {
  if (target?.kind !== 'url') return target;
  return { kind: 'url', url: normalizePath(target.url) };
}

function linkToSave(link: MegaMenuLink, catalog: NavTargetCatalog | null): MegaMenuLink {
  const target = tidyTarget(link.target);
  const next: MegaMenuLink = { ...link, path: pathFor(target, link.path, catalog) };
  if (target) next.target = target;
  return next;
}

/**
 * The navigation as it is saved (ATS-246): `path` is always written next to `target`, so
 * the store's readers of `path` (category page, Brands page, footer) and the server seed
 * keep working, and older menus without `target` stay as they are.
 */
export function withTargetPaths(
  categories: readonly NavCategory[],
  catalog: NavTargetCatalog | null,
): NavCategory[] {
  return categories.map((category) => {
    const target = tidyTarget(category.target);
    const path = pathFor(target, category.path ?? '', catalog);
    const next: NavCategory = {
      ...category,
      megaMenu: category.megaMenu?.map((column) => ({
        ...column,
        links: column.links.map((link) => linkToSave(link, catalog)),
      })),
    };
    if (!next.megaMenu) delete next.megaMenu;
    if (target) next.target = target;
    else delete next.target;
    if (path) next.path = path;
    else delete next.path;
    return next;
  });
}
