import {
  effectiveNavTarget,
  resolveNavTarget,
  type MegaMenuColumn,
  type MegaMenuLink,
  type NavCategory,
  type NavTarget,
  type NavTargetCatalog,
} from '@core/services/navigation';
import { normalizePath } from './navigation-manager.utils';

/**
 * A saved link as it is written (ATS-246, ATS-267): its target (an old typed address on our
 * site becomes the target it names) and the address built from it. An Outside Link keeps its
 * `https://` address. A link that can't be matched keeps what it had; the save check refuses it.
 */
export function targetAndPath(
  target: NavTarget | undefined,
  saved: string,
  catalog: NavTargetCatalog,
): { readonly target: NavTarget | undefined; readonly path: string } {
  const effective = effectiveNavTarget(target, saved, catalog);
  if (!effective) return { target, path: saved ? normalizePath(saved) : '' };
  if (effective.kind === 'url') {
    const url = effective.url.trim();
    return { target: { kind: 'url', url }, path: url };
  }
  return { target: effective, path: resolveNavTarget(effective, catalog).path ?? saved };
}

function linkToSave(link: MegaMenuLink, catalog: NavTargetCatalog): MegaMenuLink {
  const { target, path } = targetAndPath(link.target, link.path, catalog);
  const next: MegaMenuLink = { ...link, path };
  // Firestore refuses `undefined`, e.g. a saved target the schema couldn't read.
  if (target) next.target = target;
  else delete next.target;
  return next;
}

/**
 * The navigation as it is saved (ATS-246): `path` is always written next to `target`, so
 * the store's readers of `path` (category page, Brands page, footer) and the server seed
 * keep working, and older menus without `target` get one.
 */
export function withTargetPaths(
  categories: readonly NavCategory[],
  catalog: NavTargetCatalog,
): NavCategory[] {
  return categories.map((category) => {
    const { target, path } = targetAndPath(category.target, category.path ?? '', catalog);
    const next: NavCategory = {
      ...category,
      megaMenu: category.megaMenu?.map((column) => {
        const saved: MegaMenuColumn = {
          ...column,
          links: column.links.map((link) => linkToSave(link, catalog)),
        };
        // Firestore refuses `undefined`; a column that doesn't fill itself has no `auto` key.
        if (!saved.auto) delete saved.auto;
        return saved;
      }),
    };
    if (!next.megaMenu) delete next.megaMenu;
    if (target) next.target = target;
    else delete next.target;
    if (path) next.path = path;
    else delete next.path;
    return next;
  });
}
