import { Routes } from '@angular/router';
import { checkoutAuthGuard } from '@core/guards/checkout/checkout-auth.guard';
import { serverCurrencyResolver } from '@core/services/currency/server-currency.resolver';
import { catalogSettingsResolver } from '@core/services/products/catalog-settings.resolver';
import { navigationSettingsResolver } from '@core/services/navigation/navigation-settings.resolver';
import { shippingSettingsResolver } from '@core/services/shipping/shipping-settings.resolver';
import { homeSettingsResolver } from './features/home/resolvers/home-settings.resolver';
import { productPageResolver } from './features/product/resolvers/product-page.resolver';

export const routes: Routes = [
  // 1. Storefront Routes (wrapped inside MainLayoutComponent with the Puma-style Navbar)
  {
    path: '',
    loadComponent: () =>
      import('./layout/main/main.component').then((m) => m.MainLayoutComponent),
    resolve: {
      serverCurrency: serverCurrencyResolver,
      shippingSettings: shippingSettingsResolver,
      navigationSettings: navigationSettingsResolver,
      catalogSettings: catalogSettingsResolver,
    },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
        resolve: { homeSettings: homeSettingsResolver },
        title: 'Atteya Store | Premium Padel & Sports Gear',
      },
      {
        path: 'category/:slug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Category | Atteya Store',
        data: { preload: true },
      },
      {
        path: 'category/:slug/:subSlug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Category | Atteya Store',
        data: { preload: true },
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
        data: { isBrand: true, preload: true },
      },
      {
        path: 'product/:slug',
        loadComponent: () =>
          import('./features/product/product.component').then((m) => m.ProductComponent),
        resolve: { page: productPageResolver },
        runGuardsAndResolvers: 'always',
        title: 'Product | Atteya Store',
        data: { preload: true },
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/search/search.component').then((m) => m.SearchComponent),
        title: 'Search | Atteya Store',
        data: { preload: true },
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
        title: 'Sign in | Atteya Store',
      },
      {
        path: 'checkout',
        canActivate: [checkoutAuthGuard],
        loadComponent: () =>
          import('./features/checkout/pages/checkout.page').then((m) => m.CheckoutPageComponent),
        title: 'Checkout | Atteya Store',
      },
      {
        path: 'checkout/confirmation/:orderId',
        canActivate: [checkoutAuthGuard],
        loadComponent: () =>
          import('./features/checkout/pages/checkout-confirmation.page').then(
            (m) => m.CheckoutConfirmationPageComponent,
          ),
        title: 'Order received | Atteya Store',
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
