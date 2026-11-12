/** Store name in share previews (`og:site_name`). */
export const SEO_SITE_NAME = 'Atteya Store';

/** Default share-preview photo, a file in `public/` (1920×1080 JPEG). */
export const SEO_DEFAULT_IMAGE_PATH = '/img/hero/default-hero.jpg';

/** Width of product share photos through ImageKit. */
export const SEO_IMAGE_WIDTH = 1200;

/** Longest `og:description` we write. */
const SHARE_DESCRIPTION_MAX = 200;

/** `https://atteyastore.com/` → `https://atteyastore.com`. */
export function siteOrigin(baseUrl: string): string {
  let origin = baseUrl.trim();
  while (origin.endsWith('/')) origin = origin.slice(0, -1);
  return origin;
}

/**
 * Canonical address for a route: origin plus the path segments, no query, fragment
 * or matrix params, and no trailing slash except the home page (`/`).
 */
export function canonicalUrl(baseUrl: string, segments: readonly string[]): string {
  const path = segments
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${siteOrigin(baseUrl)}/${path}`;
}

/**
 * Plain text from stored description HTML, for a share preview. A single pass
 * (no regular expressions), so long input never backtracks.
 */
export function textFromHtml(html: string | null | undefined): string {
  if (!html) return '';
  let text = '';
  let inTag = false;
  for (const char of html) {
    if (inTag) {
      if (char === '>') {
        inTag = false;
        text += ' ';
      }
      continue;
    }
    if (char === '<') {
      inTag = true;
      continue;
    }
    text += char;
  }
  return shareText(
    text
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&'),
  );
}

/** Collapses whitespace and cuts at a word near 200 characters, ending in "…". */
export function shareText(value: string): string {
  const collapsed = value.split(/\s+/).filter(Boolean).join(' ');
  if (collapsed.length <= SHARE_DESCRIPTION_MAX) return collapsed;
  const cut = collapsed.slice(0, SHARE_DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
