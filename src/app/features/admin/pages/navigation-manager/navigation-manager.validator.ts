import { MegaMenuColumn, MegaMenuLink, NavCategory } from '@layout/navbar/nav.model';

function validateLink(link: MegaMenuLink): string | null {
  if (!link.label.trim()) return 'A link is missing a label.';
  if (!link.path.trim()) return `Link "${link.label}" is missing a target path.`;
  return null;
}

function validateColumn(col: MegaMenuColumn, categoryLabel: string): string | null {
  for (const link of col.links) {
    const error = validateLink(link);
    if (error) {
      return error === 'A link is missing a label.'
        ? `A link in category "${categoryLabel}" is missing a label.`
        : error;
    }
  }
  return null;
}

function validateCategory(cat: NavCategory): string | null {
  if (!cat.label.trim()) return `Category "${cat.id}" is missing a label.`;
  if (!cat.megaMenu) return null;

  for (const col of cat.megaMenu) {
    const error = validateColumn(col, cat.label);
    if (error) return error;
  }

  return null;
}

/**
 * Validates the navigation draft before publishing.
 * Reduces cognitive complexity by breaking category, column, and link validations
 * into focused, single-purpose functions.
 *
 * @returns Error message if validation fails, or null if valid.
 */
export function validateNavigationDraft(categories: readonly NavCategory[]): string | null {
  for (const cat of categories) {
    const error = validateCategory(cat);
    if (error) return error;
  }
  return null;
}
