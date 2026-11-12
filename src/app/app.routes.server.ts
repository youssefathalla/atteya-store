import { RenderMode, ServerRoute } from '@angular/ssr';

/** Geo-priced HTML must not sit on App Hosting CDN (no supported per-visitor cache key). */
const GEO_PRICED_HTML_CACHE = 'private, no-store';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'shop',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': GEO_PRICED_HTML_CACHE },
  },
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
  // No prices on this page, but a Navigation edit must show on the next request,
  // so it stays out of the CDN like the other server-rendered storefront pages.
  {
    path: 'brands',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': 'private, no-store' },
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
  // Admin-only sandbox: the guard needs the browser session, so it is never prerendered.
  {
    path: 'playground',
    renderMode: RenderMode.Client,
  },
  {
    path: 'terms',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'privacy',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'account',
    renderMode: RenderMode.Client,
    headers: { 'Cache-Control': 'private, no-store' },
  },
  {
    path: 'favorites',
    renderMode: RenderMode.Client,
    headers: { 'Cache-Control': 'private, no-store' },
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
