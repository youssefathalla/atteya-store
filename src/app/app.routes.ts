import { Routes } from '@angular/router';
import { adminGuard } from '@core/guards/admin/admin.guard';
import { checkoutAuthGuard, orderConfirmationGuard } from '@core/guards/checkout/checkout-auth.guard';
import { accountAuthGuard } from '@core/guards/account/account-auth.guard';
import { favoritesAuthGuard } from '@core/guards/favorites/favorites-auth.guard';
import { serverCurrencyResolver } from '@core/services/currency/server-currency.resolver';
import { catalogSettingsResolver } from '@core/services/products/catalog-settings.resolver';
import { navigationSettingsResolver } from '@core/services/navigation/navigation-settings.resolver';
import { shippingSettingsResolver } from '@core/services/shipping/shipping-settings.resolver';
import { bannerOffersResolver } from '@core/services/offers/banner-offers.resolver';
import { homeSettingsResolver } from './features/home/resolvers/home-settings.resolver';
import { FOCUS_CHROME } from './layout/main/chrome-mode';
import { productPageResolver } from './features/product/resolvers/product-page.resolver';

export const routes: Routes = [
  // 1. Storefront Routes (wrapped inside MainLayoutComponent with the Puma-style Navbar)
  {
    path: '',
    loadComponent: () => import('./layout/main/main.component').then((m) => m.MainLayoutComponent),
    resolve: {
      serverCurrency: serverCurrencyResolver,
      shippingSettings: shippingSettingsResolver,
      bannerOffers: bannerOffersResolver,
      navigationSettings: navigationSettingsResolver,
      catalogSettings: catalogSettingsResolver,
    },
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
        resolve: { homeSettings: homeSettingsResolver },
        title: 'Atteya Store | Premium Padel & Sports Gear',
      },
      {
        path: 'shop',
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: 'Shop | Atteya Store',
        data: { preload: true },
      },
      {
        path: 'category/all',
        redirectTo: 'shop',
        pathMatch: 'full',
      },
      {
        path: 'category/apparel',
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: 'Apparel | Atteya Store',
        data: { shopCategory: 'apparel', preload: true },
      },
      {
        path: 'category/accessories/bags',
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: 'Bags | Atteya Store',
        data: { shopCategory: 'accessories', shopSubcategory: 'bags', preload: true },
      },
      {
        path: 'category/accessories',
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: 'Accessories | Atteya Store',
        data: { shopCategory: 'accessories', preload: true },
      },
      {
        path: 'category/rackets',
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: 'Padel | Atteya Store',
        data: { shopCategory: 'rackets', preload: true },
      },
      {
        path: 'category/bags',
        redirectTo: 'category/accessories/bags',
        pathMatch: 'full',
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
        loadComponent: () => import('./features/brands/brands.component').then((m) => m.BrandsComponent),
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
        loadComponent: () => import('./features/product/product.component').then((m) => m.ProductComponent),
        resolve: { page: productPageResolver },
        runGuardsAndResolvers: 'always',
        title: 'Product | Atteya Store',
        data: { preload: true },
      },
      {
        path: 'search',
        loadComponent: () => import('./features/search/search.component').then((m) => m.SearchComponent),
        title: 'Search | Atteya Store',
        data: { preload: true },
      },
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
        title: 'Sign in | Atteya Store',
        data: FOCUS_CHROME,
      },
      {
        path: 'terms',
        loadComponent: () => import('./features/legal/terms.page').then((m) => m.TermsPage),
        title: 'Terms and Conditions | Atteya Store',
      },
      {
        path: 'privacy',
        loadComponent: () => import('./features/legal/privacy.page').then((m) => m.PrivacyPage),
        title: 'Privacy Policy | Atteya Store',
      },
      {
        path: 'account',
        canActivate: [accountAuthGuard],
        loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPageComponent),
        title: 'Your Account | Atteya Store',
      },
      {
        path: 'favorites',
        canActivate: [favoritesAuthGuard],
        loadComponent: () =>
          import('./features/favorites/favorites.page').then((m) => m.FavoritesPageComponent),
        title: 'Favorites | Atteya Store',
      },
      {
        path: 'checkout',
        canActivate: [checkoutAuthGuard],
        loadComponent: () =>
          import('./features/checkout/pages/checkout.page').then((m) => m.CheckoutPageComponent),
        title: 'Checkout | Atteya Store',
        data: FOCUS_CHROME,
      },
      {
        path: 'checkout/confirmation/:orderId',
        canActivate: [orderConfirmationGuard],
        loadComponent: () =>
          import('./features/checkout/pages/checkout-confirmation.page').then(
            (m) => m.CheckoutConfirmationPageComponent,
          ),
        title: 'Order received | Atteya Store',
      },
    ],
  },

  // 2. Standalone Playground / Design System Sandbox (Completely Isolated from the Store)
  // Admin only: same guard as /admin, rendered on the client (see app.routes.server.ts).
  {
    path: 'playground',
    canActivate: [adminGuard],
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
