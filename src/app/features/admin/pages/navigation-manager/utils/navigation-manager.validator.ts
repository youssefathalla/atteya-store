import {
  outsideLinkProblem,
  resolveNavTarget,
  type MegaMenuLink,
  type NavAutoColumn,
  type NavCategory,
  type NavTarget,
  type NavTargetCatalog,
} from '@core/services/navigation';

export interface NavigationDraftCheck {
  /** Problems that stop the save, one per link or menu. */
  readonly errors: readonly string[];
  /** Links that save but stay off the store (their category or brand is hidden). */
  readonly warnings: readonly string[];
}

type TargetState = 'ok' | 'hidden' | 'ended' | 'missing' | 'none' | 'unmatched' | 'outside';

/**
 * Checks a link as it will be saved (after `withTargetPaths`, so an old typed address that names
 * a target already has it). An address that still has no target can't be matched (ATS-267).
 */
function targetState(
  target: NavTarget | undefined,
  path: string,
  catalog: NavTargetCatalog | null,
): TargetState {
  if (target?.kind === 'url') {
    const url = target.url.trim();
    if (!url) return 'none';
    if (url.startsWith('/')) return catalog ? 'unmatched' : 'ok';
    return outsideLinkProblem(url) ? 'outside' : 'ok';
  }
  // Until every category and brand has loaded, an old address keeps working as saved.
  if (!target) return path.trim() ? (catalog ? 'unmatched' : 'ok') : 'none';
  // Until every category and brand has loaded, a target can't be checked; the store still hides it.
  if (!catalog) return path.trim() ? 'ok' : 'none';
  const { problem } = resolveNavTarget(target, catalog);
  return problem ?? 'ok';
}

function outsideMessage(target: NavTarget | undefined): string {
  return target?.kind === 'url' ? (outsideLinkProblem(target.url) ?? '') : '';
}

function goneWhat(target: NavTarget | undefined): string {
  return target?.kind === 'category' ? 'category' : 'brand';
}

function checkLink(
  link: MegaMenuLink,
  menuLabel: string,
  catalog: NavTargetCatalog | null,
  errors: string[],
  warnings: string[],
): void {
  const name = link.label.trim();
  if (!name) {
    errors.push(`A link in "${menuLabel}" has no label.`);
    return;
  }
  const state = targetState(link.target, link.path, catalog);
  if (state === 'none') errors.push(`"${name}" in "${menuLabel}" doesn't link anywhere yet.`);
  if (state === 'unmatched') errors.push(`"${name}" in "${menuLabel}": pick where this goes.`);
  if (state === 'outside') errors.push(`"${name}" in "${menuLabel}": ${outsideMessage(link.target)}`);
  if (state === 'missing') {
    errors.push(`"${name}" in "${menuLabel}" links to a ${goneWhat(link.target)} that no longer exists.`);
  }
  if (state === 'ended') errors.push(`"${name}" in "${menuLabel}" links to an offer that isn't running now.`);
  if (state === 'hidden') warnings.push(`"${name}" in "${menuLabel}"`);
}

function checkAutoColumn(
  auto: NavAutoColumn,
  columnLabel: string,
  catalog: NavTargetCatalog | null,
  errors: string[],
  warnings: string[],
): void {
  if (auto.kind !== 'children' || !catalog) return;
  const state = resolveNavTarget({ kind: 'category', id: auto.categoryId }, catalog).problem;
  if (state === 'missing') {
    errors.push(`The "${columnLabel}" column fills from a category that no longer exists.`);
  }
  if (state === 'hidden') warnings.push(`"${columnLabel}" column`);
}

function checkMenu(
  menu: NavCategory,
  catalog: NavTargetCatalog | null,
  errors: string[],
  warnings: string[],
): void {
  const label = menu.label.trim();
  if (!label) {
    errors.push('A menu has no name.');
    return;
  }
  // No target and no path is fine for a menu: its name only opens the menu.
  const state = targetState(menu.target, menu.path ?? '', catalog);
  if (state === 'unmatched') errors.push(`The "${label}" menu: pick where this goes.`);
  // A menu name opens a store page (the store's menus can't open another site from the name).
  if (menu.target?.kind === 'url' && (state === 'ok' || state === 'outside')) {
    errors.push(`The "${label}" menu: pick a page on the store, or Only Opens the Menu.`);
  }
  if (state === 'missing') {
    errors.push(`The "${label}" menu links to a ${goneWhat(menu.target)} that no longer exists.`);
  }
  if (state === 'ended') errors.push(`The "${label}" menu links to an offer that isn't running now.`);
  if (state === 'hidden') warnings.push(`"${label}" menu`);
  for (const column of menu.megaMenu ?? []) {
    // A column that fills itself shows no saved links on the store; they are only kept for later.
    if (column.auto) {
      checkAutoColumn(column.auto, column.title?.trim() || label, catalog, errors, warnings);
      continue;
    }
    for (const link of column.links) checkLink(link, label, catalog, errors, warnings);
  }
}

/**
 * Checks the navigation draft before it is saved (ATS-246): every problem is listed, a
 * missing target or a link to nowhere stops the save, a hidden target only warns.
 */
export function validateNavigationDraft(
  categories: readonly NavCategory[],
  catalog: NavTargetCatalog | null,
): NavigationDraftCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const menu of categories) checkMenu(menu, catalog, errors, warnings);
  return { errors, warnings };
}

/** One message for the snackbar: the first few problems, then how many more. */
export function draftProblemsMessage(problems: readonly string[], shown = 3): string {
  const head = problems.slice(0, shown).join(' ');
  const rest = problems.length - shown;
  return rest > 0 ? `${head} And ${rest} more.` : head;
}

export function hiddenTargetsMessage(warnings: readonly string[]): string {
  const list =
    warnings.length > 3
      ? `${warnings.slice(0, 3).join(', ')} and ${warnings.length - 3} more`
      : warnings.join(', ');
  return `Saved. ${list} ${warnings.length === 1 ? 'links' : 'link'} to something hidden on the store, so shoppers won't see ${warnings.length === 1 ? 'it' : 'them'} yet.`;
}
