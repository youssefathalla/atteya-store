import { Routes } from '@angular/router';
import { adminGuard } from '@core/guards/admin/admin.guard';
import { checkoutAuthGuard, orderPageAuthGuard } from '@core/guards/checkout/checkout-auth.guard';
import { accountAuthGuard } from '@core/guards/account/account-auth.guard';
import { favoritesAuthGuard } from '@core/guards/favorites/favorites-auth.guard';
import { serverCurrencyResolver } from '@core/services/currency/server-currency.resolver';
import { catalogSettingsResolver } from '@core/services/products/catalog-settings.resolver';
import {
  shopCategoriesResolver,
  shopCategoryMatch,
  shopCategoryTitle,
} from '@core/services/products/shop-category.match';
import { navigationSettingsResolver } from '@core/services/navigation/navigation-settings.resolver';
import { shippingSettingsResolver } from '@core/services/shipping/shipping-settings.resolver';
import { bannerOffersResolver } from '@core/services/offers/banner-offers.resolver';
import { homeSettingsResolver } from './features/home/resolvers/home-settings.resolver';
import { FOCUS_CHROME } from './layout/main/chrome-mode';
import { productPageResolver } from './features/product/resolvers/product-page.resolver';
import { bundlePageResolver } from './features/bundle/resolvers/bundle-page.resolver';
import { catalogPageResolver } from './features/category/resolvers/catalog-page.resolver';
import { brandPageResolver } from './features/category/resolvers/brand-page.resolver';

export const routes: Routes = [
  // Admin and the playground come before the store layout, whose `**` child would otherwise match them.
  // 1. Standalone Playground / Design System Sandbox (Completely Isolated from the Store)
  // Admin only: same guard as /admin, rendered on the client (see app.routes.server.ts).
  {
    path: 'playground',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/playground/playground.component').then((m) => m.PlaygroundComponent),
    title: 'Design System & Component Playground | Atteya Store',
  },

  // 2. Dedicated Admin Dashboard (Isolated from consumer storefront layout)
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },

  // 3. Storefront Routes (wrapped inside MainLayoutComponent with the Puma-style Navbar)
  {
    path: '',
    loadComponent: () => import('./layout/main/main.component').then((m) => m.MainLayoutComponent),
    resolve: {
      serverCurrency: serverCurrencyResolver,
      shippingSettings: shippingSettingsResolver,
      bannerOffers: bannerOffersResolver,
      navigationSettings: navigationSettingsResolver,
      catalogSettings: catalogSettingsResolver,
      shopCategories: shopCategoriesResolver,
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
        // Old home-page links point at "Shop" as if it were a category; it is the /shop page.
        path: 'category/shop',
        redirectTo: 'shop',
        pathMatch: 'full',
      },
      {
        path: 'category/accessories/bags',
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: 'Bags | Atteya Store',
        resolve: { catalogPage: catalogPageResolver },
        data: { shopCategory: 'accessories', shopSubcategory: 'bags', preload: true },
      },
      {
        path: 'category/bags',
        redirectTo: 'category/accessories/bags',
        pathMatch: 'full',
      },
      {
        // Every top-level category is a Shop page filtered to it (`shopCategoryMatch`, ATS-249);
        // sub-categories and anything else fall through to the category page below.
        path: 'category/:slug',
        canMatch: [shopCategoryMatch],
        loadComponent: () => import('./features/shop/shop.page').then((m) => m.ShopPage),
        title: shopCategoryTitle,
        resolve: { catalogPage: catalogPageResolver },
        data: { categoryShop: true, preload: true },
      },
      {
        path: 'category/:slug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Category | Atteya Store',
        resolve: { catalogPage: catalogPageResolver },
        data: { preload: true },
      },
      {
        path: 'category/:slug/:subSlug',
        loadComponent: () =>
          import('./features/category/category.component').then((m) => m.CategoryComponent),
        title: 'Category | Atteya Store',
        resolve: { catalogPage: catalogPageResolver },
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
        resolve: { brandShare: brandPageResolver, catalogPage: catalogPageResolver },
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
        path: 'bundle/:offerId',
        loadComponent: () => import('./features/bundle/bundle.page').then((m) => m.BundlePage),
        resolve: { page: bundlePageResolver },
        runGuardsAndResolvers: 'paramsChange',
        title: 'Bundle & Save | Atteya Store',
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
        canActivate: [orderPageAuthGuard],
        loadComponent: () =>
          import('./features/checkout/pages/checkout-confirmation.page').then(
            (m) => m.CheckoutConfirmationPageComponent,
          ),
        title: 'Order received | Atteya Store',
      },
      {
        // Any other address: Page Not Found inside the store layout, HTTP 404 (ATS-268).
        path: '**',
        loadComponent: () => import('./features/errors/not-found.page').then((m) => m.NotFoundPage),
        title: 'Page Not Found | Atteya Store',
      },
    ],
  },
];
