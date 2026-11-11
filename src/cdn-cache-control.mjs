/**
 * Cloud CDN on Firebase App Hosting honors `CDN-Cache-Control` separately from
 * `Cache-Control`. Only cacheable values (static assets with `s-maxage`,
 * `max-age` or `immutable`) are copied into it. Geo-priced storefront HTML uses
 * `private, no-store` (see app.routes.server.ts), so it gets no CDN header and
 * the edge never caches it.
 */

/** @param {string | undefined | null} cacheControl */
export function cdnCacheControlHeader(cacheControl) {
  if (!cacheControl) return null;
  const lower = cacheControl.toLowerCase();
  if (lower.includes('private') || lower.includes('no-store')) return null;

  const sMaxAge = cacheControl.match(/\bs-maxage=(\d+)/i)?.[1];
  if (sMaxAge) {
    const swr = cacheControl.match(/\bstale-while-revalidate=(\d+)/i)?.[1];
    let value = `public, max-age=${sMaxAge}`;
    if (swr) value += `, stale-while-revalidate=${swr}`;
    return value;
  }

  if (lower.includes('immutable')) {
    return 'public, max-age=31536000, immutable';
  }

  const maxAge = cacheControl.match(/\bmax-age=(\d+)/i)?.[1];
  if (maxAge && Number(maxAge) > 0) {
    return `public, max-age=${maxAge}`;
  }

  return null;
}

/** @param {Headers} headers */
export function applyCdnCacheControl(headers) {
  if (headers.has('CDN-Cache-Control')) return;
  const value = cdnCacheControlHeader(headers.get('Cache-Control'));
  if (value) headers.set('CDN-Cache-Control', value);
}
