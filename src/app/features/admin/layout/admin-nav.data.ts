import { AdminNavCategory } from './admin-nav.model';

export const ADMIN_NAV_CATEGORIES: readonly AdminNavCategory[] = [
  {
    id: 'storefront',
    label: 'Storefront & Design',
    icon: 'storefront',
    subItems: [
      {
        id: 'navigation-menus',
        label: 'Navigation & Menus',
        path: '/admin/navigation',
        icon: 'menu',
        badge: 'Live',
        description: 'Header menus, mega menu links, and release cards',
      },
      {
        id: 'banners',
        label: 'Banners & Promotions',
        path: '/admin/banners',
        icon: 'view_carousel',
        badge: 'Soon',
        disabled: true,
        description: 'Hero banners, promo carousels, and announcements',
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Store & Catalog',
    icon: 'inventory_2',
    subItems: [
      {
        id: 'products',
        label: 'Products',
        path: '/admin/products',
        icon: 'sports_tennis',
        badge: 'Soon',
        disabled: true,
        description: 'Catalog items, inventory count, and pricing',
      },
      {
        id: 'categories',
        label: 'Categories & Taxonomy',
        path: '/admin/categories',
        icon: 'category',
        badge: 'Soon',
        disabled: true,
        description: 'Product taxonomy, filters, and attributes',
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales & Orders',
    icon: 'shopping_cart',
    subItems: [
      {
        id: 'orders',
        label: 'Orders',
        path: '/admin/orders',
        icon: 'receipt_long',
        badge: 'Soon',
        disabled: true,
        description: 'Customer purchases, fulfillment, and invoices',
      },
      {
        id: 'customers',
        label: 'Customers',
        path: '/admin/customers',
        icon: 'people',
        badge: 'Soon',
        disabled: true,
        description: 'Buyer accounts, purchase history, and tiers',
      },
    ],
  },
];
