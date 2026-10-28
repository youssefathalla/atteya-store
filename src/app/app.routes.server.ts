import { RenderMode, ServerRoute } from '@angular/ssr';

/** Shared HTML cache: browsers revalidate, the CDN may keep a copy for 60s and serve a stale one for 5 min. */
const PUBLIC_HTML_CACHE =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'category/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': PUBLIC_HTML_CACHE },
  },
  {
    path: 'brand/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': PUBLIC_HTML_CACHE },
  },
  {
    path: 'product/**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': PUBLIC_HTML_CACHE },
  },
  // Shell only. The results resource stays idle on the server, so hits are never transferred.
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
