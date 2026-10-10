/**
 * Pure utility functions for Navigation Manager slug and path operations.
 */

export function slugify(text: string): string {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
  while (slug.startsWith('-')) slug = slug.slice(1);
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  return slug;
}

export function normalizePath(rawPath: string): string {
  let path = rawPath.trim();
  if (path && !path.startsWith('/')) path = `/${path}`;
  return path;
}
