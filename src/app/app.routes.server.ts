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
  // search must stay client-rendered so stale results are never transferred
  {
    path: 'search',
    renderMode: RenderMode.Client,
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
