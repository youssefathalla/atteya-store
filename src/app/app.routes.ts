import { Routes } from '@angular/router';
import { productPageResolver } from './features/product/resolvers/product-page.resolver';

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
      {
        path: 'category/:slug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Category | Atteya Store',
      },
      {
        path: 'category/:slug/:subSlug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Category | Atteya Store',
      },
      {
        path: 'brands',
        loadComponent: () =>
          import('./features/brands/brands.component').then((m) => m.BrandsComponent),
        title: 'Featured Brands | Atteya Store',
      },
      {
        path: 'brand/:slug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Brand | Atteya Store',
        data: { isBrand: true },
      },
      {
        path: 'product/:slug',
        loadComponent: () =>
          import('./features/product/product.component').then((m) => m.ProductComponent),
        resolve: { page: productPageResolver },
        runGuardsAndResolvers: 'always',
        title: 'Product | Atteya Store',
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/search/search.component').then((m) => m.SearchComponent),
        title: 'Search | Atteya Store',
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
        title: 'Sign in | Atteya Store',
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

  // 3. Dedicated Admin Dashboard (Isolated from consumer storefront layout)
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },

  // 4. Fallback Route
  {
    path: '**',
    redirectTo: '',
  },
];
