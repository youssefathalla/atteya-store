import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'category/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'brand/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'product/**',
    renderMode: RenderMode.Server,
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
