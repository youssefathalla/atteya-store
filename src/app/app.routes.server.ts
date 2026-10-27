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
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
