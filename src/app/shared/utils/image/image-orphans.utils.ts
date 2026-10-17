import { PROTECTED_STORAGE_PATHS } from './image.constants';
import { normalizeImageKitPath } from './image-url.utils';

/**
 * Computes managed Firebase Storage paths from `candidates` that are no longer
 * referenced in `kept` and are not protected defaults or local/external URLs.
 */
export function diffOrphanedPaths(
  candidates: readonly string[],
  kept: readonly string[],
  protectedPaths: readonly string[] = PROTECTED_STORAGE_PATHS,
): string[] {
  const keptSet = new Set(kept.map((p) => normalizeImageKitPath(p)).filter(Boolean));
  const protectedSet = new Set(protectedPaths.map((p) => normalizeImageKitPath(p)));
  const orphans = new Set<string>();

  for (const rawPath of candidates) {
    const normalized = normalizeImageKitPath(rawPath);
    if (
      normalized &&
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://') &&
      !normalized.startsWith('img/') &&
      !keptSet.has(normalized) &&
      !protectedSet.has(normalized)
    ) {
      orphans.add(normalized);
    }
  }

  return Array.from(orphans);
}
