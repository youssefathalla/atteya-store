/**
 * Utility functions for ImageKit asset path handling and normalization.
 */

/**
 * Checks whether a given string is an external third-party URL (e.g. Unsplash, Pexels),
 * and not a Firebase Storage or ImageKit managed URL.
 */
export function isExternalUrl(urlOrPath: string): boolean {
  if (!urlOrPath) {
    return false;
  }
  const trimmed = urlOrPath.trim();
  return (
    /^https?:\/\//i.test(trimmed) &&
    !trimmed.includes('ik.imagekit.io') &&
    !trimmed.includes('firebasestorage.googleapis.com') &&
    !trimmed.includes('storage.googleapis.com')
  );
}

/**
 * Normalizes an image source into an ImageKit-compatible relative path for `NgOptimizedImage`.
 *
 * If the input is already a relative path (e.g. `hero/hero-banner.png`), it strips leading slashes.
 * If the input is a full Firebase Storage or Google Cloud Storage URL, it extracts the relative path.
 */
export function normalizeImageKitPath(urlOrPath: string): string {
  if (!urlOrPath) {
    return '';
  }

  const trimmed = urlOrPath.trim();

  // If it's a data URL or blob, return directly
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Handle Google Cloud Storage public URLs:
  // https://storage.googleapis.com/<bucket-name>/<path>
  const gcsMatch = trimmed.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/);
  if (gcsMatch && gcsMatch[1]) {
    return gcsMatch[1];
  }

  // Handle Firebase Storage standard URLs:
  // https://firebasestorage.googleapis.com/v0/b/<bucket-name>/o/<encoded-path>?alt=media...
  const fbMatch = trimmed.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/);
  if (fbMatch && fbMatch[1]) {
    return decodeURIComponent(fbMatch[1]);
  }

  // Handle already prefixed ImageKit URLs:
  // https://ik.imagekit.io/<imagekit-id>/<path>
  const ikMatch = trimmed.match(/^https:\/\/ik\.imagekit\.io\/[^/]+\/(.+)$/);
  if (ikMatch && ikMatch[1]) {
    return ikMatch[1].replace(/\?.*$/, '');
  }

  // If relative path with leading slash, remove it for NgOptimizedImage
  return trimmed.replace(/^\/+/, '');
}
