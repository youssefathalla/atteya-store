import { RenderMode, ServerRoute } from '@angular/ssr';

/** Shared HTML cache: browsers revalidate; CDN must not reuse HTML across visitor IPs. */
const PUBLIC_HTML_CACHE =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const GEO_VARY = 'Accept-Encoding, X-Forwarded-For';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'category/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': PUBLIC_HTML_CACHE, Vary: GEO_VARY },
  },
  {
    path: 'brand/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': PUBLIC_HTML_CACHE, Vary: GEO_VARY },
  },
  {
    path: 'product/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': PUBLIC_HTML_CACHE, Vary: GEO_VARY },
  },
  {
    path: 'search',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': 'private, no-store' },
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'login',
    renderMode: RenderMode.Client,
  },
  {
    path: 'checkout/**',
    renderMode: RenderMode.Client,
  },
  // Banner edits must show on the next request, so this HTML stays out of the CDN.
  // private forbids a shared cache; no-store forbids storing it at all.
  // no-cache would still allow a cache to keep a copy and reuse it after revalidation.
  {
    path: '',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': 'private, no-store' },
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
