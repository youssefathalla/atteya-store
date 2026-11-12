/**
 * Built-in categories and brands staff deleted in Categories & Brands (ATS-265). The server keeps
 * their ids in `settings/catalog.deletedBuiltInIds`, so the store stops opening them and the
 * built-in menu and home defaults leave out links to them. Pure: tested by `npm run test:cart`.
 */

/** The `settings/catalog` field (same name as `DELETED_BUILT_IN_FIELD` in functions). */
export const DELETED_BUILT_IN_FIELD = 'deletedBuiltInIds';

const CATALOG_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Reads the saved list; anything that isn't a list of ids counts as none. */
export function readDeletedBuiltInIds(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string' && CATALOG_ID.test(value));
}

/**
 * True when a store address opens a deleted built-in: `/category/<…>/<id>` (the last part of the
 * category address) or `/brand/<id>`. Query strings and other pages never count.
 */
export function pathOpensDeletedBuiltIn(path: string | undefined, deleted: ReadonlySet<string>): boolean {
  if (!path || deleted.size === 0) return false;
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  const parts = pathname
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
  if (parts.length < 2) return false;
  if (parts[0] === 'category') return deleted.has(parts[parts.length - 1] ?? '');
  if (parts[0] === 'brand') return parts.length === 2 && deleted.has(parts[1] ?? '');
  return false;
}
