import { IMAGE_LIMITS } from './image.constants';
import { extractManagedStoragePath } from './image-url.utils';

export type ImageInputIssue = 'empty' | 'malformed-url' | 'unsupported-protocol' | 'not-an-image-file';

export type ParsedImageInput =
  | { readonly kind: 'external-url'; readonly url: string }
  | { readonly kind: 'managed-path'; readonly path: string }
  | { readonly kind: 'invalid'; readonly issue: ImageInputIssue };

/**
 * Checks if a path or URL ends with one of the allowed raster image extensions
 * (.jpg, .jpeg, .png, .webp, .avif). Rejects .svg and non-image extensions.
 */
export function hasAllowedImageExtension(pathOrUrl: string): boolean {
  const clean = pathOrUrl.split('?')[0].split('#')[0].trim().toLowerCase();
  return IMAGE_LIMITS.allowedExtensions.some((ext) => clean.endsWith(ext));
}

/**
 * Checks if a raw input looks like a domain name without protocol (e.g. `images.unsplash.com/photo...`).
 */
export function looksLikeDomainUrl(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return false;
  }
  const firstSlash = raw.indexOf('/');
  if (firstSlash === -1) return false;
  const host = raw.slice(0, firstSlash);
  return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
}

function parseHttpInput(target: string): ParsedImageInput {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { kind: 'invalid', issue: 'malformed-url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'invalid', issue: 'unsupported-protocol' };
  }

  if (parsed.pathname.toLowerCase().endsWith('.svg')) {
    return { kind: 'invalid', issue: 'not-an-image-file' };
  }

  const managed = extractManagedStoragePath(target);
  if (managed !== null) {
    return hasAllowedImageExtension(managed)
      ? { kind: 'managed-path', path: managed }
      : { kind: 'invalid', issue: 'not-an-image-file' };
  }

  if (parsed.protocol !== 'https:') {
    return { kind: 'invalid', issue: 'unsupported-protocol' };
  }

  return { kind: 'external-url', url: parsed.toString() };
}

/**
 * Classifies a raw user string (pasted URL, ImageKit URL, Storage URL, or relative bucket path)
 * into `external-url`, `managed-path`, or `invalid`.
 */
export function parseImageInput(raw: string): ParsedImageInput {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: 'invalid', issue: 'empty' };
  }

  const normalized = looksLikeDomainUrl(trimmed) ? `https://${trimmed}` : trimmed;
  const lower = normalized.toLowerCase();

  if (lower.includes('://')) {
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      return { kind: 'invalid', issue: 'unsupported-protocol' };
    }
    return parseHttpInput(normalized);
  }

  let cleanPath = normalized;
  while (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }

  if (!cleanPath || !hasAllowedImageExtension(cleanPath)) {
    return { kind: 'invalid', issue: 'not-an-image-file' };
  }

  return { kind: 'managed-path', path: cleanPath };
}

/**
 * Generates a human-readable default alt text from a filename (max 125 chars).
 */
export function sanitizeAltFromFilename(filename: string): string {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf('.');
  const withoutExt = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const readable = withoutExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return readable.slice(0, IMAGE_LIMITS.maxAltLength);
}
