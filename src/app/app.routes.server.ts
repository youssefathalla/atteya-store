import { RenderMode, ServerRoute } from '@angular/ssr';

/** Geo-priced HTML must not sit on App Hosting CDN (no supported per-visitor cache key). */
const GEO_PRICED_HTML_CACHE = 'private, no-store';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'category/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': GEO_PRICED_HTML_CACHE },
  },
  {
    path: 'brand/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': GEO_PRICED_HTML_CACHE },
  },
  {
    path: 'product/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': GEO_PRICED_HTML_CACHE },
  },
  {
    path: 'search',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': GEO_PRICED_HTML_CACHE },
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
    headers: { 'Cache-Control': GEO_PRICED_HTML_CACHE },
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
