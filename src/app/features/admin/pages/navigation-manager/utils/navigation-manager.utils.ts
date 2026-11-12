/**
 * Pure utility functions for Navigation Manager paths.
 */

/** A saved address tidied: a leading `/`, no trailing `/`. An Outside Link (`https://…`) is kept as typed. */
export function normalizePath(rawPath: string): string {
  let path = rawPath.trim();
  if (/^https?:\/\//i.test(path)) return path;
  if (path && !path.startsWith('/')) path = `/${path}`;
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}
