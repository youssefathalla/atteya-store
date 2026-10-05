import { Routes } from '@angular/router';

export const routes: Routes = [
  // 1. Storefront Routes (wrapped inside MainLayoutComponent with the Puma-style Navbar)
  {
    path: '',
    loadComponent: () =>
      import('./layout/main/main.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
        title: 'Atteya Store | Premium Padel & Sports Gear',
      },
    ],
  },

  // 2. Standalone Playground / Design System Sandbox (Completely Isolated from the Store)
  {
    path: 'playground',
    loadComponent: () =>
      import('./features/playground/playground.component').then((m) => m.PlaygroundComponent),
    title: 'Design System & Component Playground | Atteya Store',
  },

  // 3. Fallback Route
  {
    path: '**',
    redirectTo: '',
  },
];
