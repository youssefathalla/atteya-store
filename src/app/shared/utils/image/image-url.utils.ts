import { environment } from '@env/environment';

export interface ImageTransform {
  readonly w?: number;
  readonly h?: number;
  readonly q?: number;
  readonly f?: 'auto' | 'webp' | 'avif';
}

const BUCKET = environment.firebase.storageBucket ?? '';
const IMAGEKIT_BASE = environment.imageKitUrl.endsWith('/')
  ? environment.imageKitUrl.slice(0, -1)
  : environment.imageKitUrl;

function stripLeadingSlashes(value: string): string {
  let result = value;
  while (result.startsWith('/')) {
    result = result.slice(1);
  }
  return result;
}

/**
 * Extracts a relative bucket path if and only if the URL points to OUR configured
 * Firebase Storage bucket or ImageKit endpoint. Returns `null` for external URLs
 * or other buckets.
 */
export function extractManagedStoragePath(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // 1. Google Cloud Storage URL: https://storage.googleapis.com/<bucket>/<path>
  if (parsed.hostname === 'storage.googleapis.com') {
    const pathNoLead = stripLeadingSlashes(parsed.pathname);
    const firstSlash = pathNoLead.indexOf('/');
    if (firstSlash === -1) return null;
    const bucket = pathNoLead.slice(0, firstSlash);
    const objectPath = pathNoLead.slice(firstSlash + 1);
    if (bucket !== BUCKET || !objectPath) return null;
    return objectPath
      .split('/')
      .map((seg) => decodeURIComponent(seg))
      .join('/');
  }

  // 2. Firebase Storage REST URL: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>
  if (parsed.hostname === 'firebasestorage.googleapis.com') {
    const prefix = '/v0/b/';
    if (!parsed.pathname.startsWith(prefix)) return null;
    const rest = parsed.pathname.slice(prefix.length);
    const oMarker = '/o/';
    const oIdx = rest.indexOf(oMarker);
    if (oIdx === -1) return null;
    const bucket = rest.slice(0, oIdx);
    const encodedPath = rest.slice(oIdx + oMarker.length);
    if (bucket !== BUCKET || !encodedPath) return null;
    return stripLeadingSlashes(decodeURIComponent(encodedPath));
  }

  // 3. ImageKit URL matching our configured endpoint.
  // The Angular loader inserts a leading `tr:` segment (`…/tr:w-1080/products/…`).
  if (trimmed.startsWith(`${IMAGEKIT_BASE}/`)) {
    const afterBase = trimmed.slice(IMAGEKIT_BASE.length + 1);
    const segments = stripLeadingSlashes(afterBase.split('?')[0].split('#')[0]).split('/');
    if (segments[0]?.startsWith('tr:')) segments.shift();
    try {
      return segments.map((seg) => decodeURIComponent(seg)).join('/');
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Checks whether a given string is an external third-party URL (including other buckets),
 * and not a managed URL belonging to our configured bucket or ImageKit endpoint.
 */
export function isExternalUrl(urlOrPath: string): boolean {
  if (!urlOrPath) return false;
  const trimmed = urlOrPath.trim();
  const isHttp = trimmed.toLowerCase().startsWith('http://') || trimmed.toLowerCase().startsWith('https://');
  if (!isHttp) return false;
  return extractManagedStoragePath(trimmed) === null;
}

/**
 * Normalizes an image source into an ImageKit-compatible relative path for `NgOptimizedImage`.
 *
 * - Relative paths (`hero/banner.webp` or `/hero/banner.webp`) have leading slashes stripped.
 * - Managed URLs from our bucket or ImageKit are converted to their relative storage path.
 * - External URLs, `data:`, and `blob:` URLs are returned as-is.
 */
export function normalizeImageKitPath(urlOrPath: string): string {
  if (!urlOrPath) return '';
  const trimmed = urlOrPath.trim();

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const managed = extractManagedStoragePath(trimmed);
  if (managed !== null) {
    return managed;
  }

  if (trimmed.toLowerCase().startsWith('http://') || trimmed.toLowerCase().startsWith('https://')) {
    return trimmed;
  }

  return stripLeadingSlashes(trimmed);
}

/**
 * Builds a direct Google Cloud Storage public URL (the same origin ImageKit reads from).
 * Works without Firebase Storage rules read evaluation and uses the active environment bucket.
 */
export function buildStorageUrl(pathOrUrl: string): string {
  const cleanPath = normalizeImageKitPath(pathOrUrl);
  if (!cleanPath) return '';
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return cleanPath;
  }
  const encodedPath = cleanPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://storage.googleapis.com/${BUCKET}/${encodedPath}`;
}

/**
 * Alias for `buildStorageUrl` kept for backwards compatibility.
 */
export function getFirebaseStorageUrl(pathOrUrl: string): string {
  return buildStorageUrl(pathOrUrl);
}

/**
 * Builds an explicit ImageKit CDN URL for probes, `og:image`, or JSON-LD metadata.
 * (Storefront `<img>` tags still use `NgOptimizedImage` with `provideImageKitLoader`.)
 */
export function buildImageKitUrl(pathOrUrl: string, tr?: ImageTransform): string {
  const cleanPath = normalizeImageKitPath(pathOrUrl);
  if (!cleanPath) return '';
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return cleanPath;
  }

  const url = `${IMAGEKIT_BASE}/${cleanPath}`;
  if (!tr) return url;

  const parts: string[] = [];
  if (tr.w) parts.push(`w-${tr.w}`);
  if (tr.h) parts.push(`h-${tr.h}`);
  if (tr.q) parts.push(`q-${tr.q}`);
  if (tr.f) parts.push(`f-${tr.f}`);

  return parts.length > 0 ? `${url}?tr=${parts.join(',')}` : url;
}
