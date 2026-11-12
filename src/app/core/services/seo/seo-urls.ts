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
  return shareText(decodeEntities(text));
}

/** Named entities old-store descriptions use; anything else unknown stays as written. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  bull: '\u2022',
  times: '\u00D7',
  eacute: '\u00E9',
};

/** `&rsquo;`, `&#8217;`, `&#x27;` → the character. Each match is one bounded token, so no backtracking. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (match, code: string) => {
    if (code[0] === '#') {
      const hex = code[1] === 'x' || code[1] === 'X';
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Collapses whitespace and cuts at a word near 200 characters, ending in "…". */
export function shareText(value: string): string {
  const collapsed = value.split(/\s+/).filter(Boolean).join(' ');
  if (collapsed.length <= SHARE_DESCRIPTION_MAX) return collapsed;
  const cut = collapsed.slice(0, SHARE_DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
