import { Routes } from '@angular/router';
import { adminGuard, adminOnlyGuard } from '@core/guards/admin/admin.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () => import('./layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'navigation',
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./pages/home-manager/home-manager.component').then((m) => m.HomeManagerComponent),
        title: 'Home Page Manager | Atteya Admin',
      },
      {
        path: 'navigation',
        loadComponent: () =>
          import('./pages/navigation-manager/navigation-manager.component').then(
            (m) => m.NavigationManagerComponent,
          ),
        title: 'Navigation & Menus | Atteya Admin',
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./pages/products-manager/products-manager.component').then(
            (m) => m.ProductsManagerComponent,
          ),
        title: 'Products | Atteya Admin',
      },
      {
        path: 'products/new',
        loadComponent: () =>
          import('./pages/products-manager/product-editor.page').then((m) => m.ProductEditorPageComponent),
        title: 'New Product | Atteya Admin',
      },
      {
        path: 'products/:productId',
        loadComponent: () =>
          import('./pages/products-manager/product-editor.page').then((m) => m.ProductEditorPageComponent),
        title: 'Edit Product | Atteya Admin',
      },
      {
        path: 'offers',
        loadComponent: () =>
          import('./pages/offers-manager/offers-manager.page').then((m) => m.OffersManagerPageComponent),
        title: 'Offers | Atteya Admin',
      },
      {
        path: 'offers/new',
        loadComponent: () =>
          import('./pages/offers-manager/offer-editor.page').then((m) => m.OfferEditorPageComponent),
        title: 'New Offer | Atteya Admin',
      },
      {
        path: 'offers/:offerId',
        loadComponent: () =>
          import('./pages/offers-manager/offer-editor.page').then((m) => m.OfferEditorPageComponent),
        title: 'Edit Offer | Atteya Admin',
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./pages/catalog-manager/catalog-manager.page').then((m) => m.CatalogManagerPageComponent),
        title: 'Categories & Brands | Atteya Admin',
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./pages/orders-manager/orders-manager.page').then((m) => m.OrdersManagerPageComponent),
        title: 'Orders | Atteya Admin',
      },
      {
        path: 'orders/:orderId',
        loadComponent: () =>
          import('./pages/orders-manager/order-tracking/order-tracking.page').then(
            (m) => m.OrderTrackingPageComponent,
          ),
        title: 'Track Order | Atteya Admin',
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./pages/customers-manager/customers-manager.page').then(
            (m) => m.CustomersManagerPageComponent,
          ),
        title: 'Customers | Atteya Admin',
      },
      {
        // Componentless parent: each Settings sidebar entry is a standalone page
        // (no shared in-page tab/switcher duplicating the admin sidebar).
        path: 'settings',
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'shipping',
          },
          {
            path: 'admins',
            canActivate: [adminOnlyGuard],
            loadComponent: () =>
              import('./pages/settings/admins/admins-tab.component').then((m) => m.AdminsTabComponent),
            title: 'Team | Atteya Admin',
          },
          {
            path: 'shipping',
            loadComponent: () =>
              import('./pages/settings/shipping/shipping-tab.component').then((m) => m.ShippingTabComponent),
            title: 'Shipping | Atteya Admin',
          },
          {
            path: 'players',
            loadComponent: () =>
              import('./pages/settings/players/players-tab.component').then((m) => m.PlayersTabComponent),
            title: 'Players | Atteya Admin',
          },
          {
            path: 'international',
            loadComponent: () =>
              import('./pages/settings/international/international-tab.component').then(
                (m) => m.InternationalTabComponent,
              ),
            title: 'Outside Egypt | Atteya Admin',
          },
        ],
      },
    ],
  },
];
