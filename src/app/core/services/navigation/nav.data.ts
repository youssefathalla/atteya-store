import { NavCategory } from './nav.model';

/**
 * Built-in navigation, used when `settings/navigation` is missing (and by Admin → Navigation
 * "reset to defaults"). Every link must open a page that exists today with matching products:
 * a shop route (`/shop`, `/category/rackets|apparel|accessories`, `/category/accessories/bags`,
 * optionally with a shop filter such as `?onSale=1`), a published category page
 * (`/category/<id>`), a published brand page (`/brand/<id>`), or `/brands`.
 * Do not link merchandising paths (`…/new`, `…/best-sellers`), unpublished categories or brands,
 * or query filters the page does not read.
 */
export const NAV_CATEGORIES: readonly NavCategory[] = [
  {
    id: 'rackets',
    label: 'RACKETS',
    path: '/category/rackets',
    megaMenu: [
      {
        title: 'HIGHLIGHTS',
        links: [{ label: 'All Rackets', path: '/category/rackets' }],
      },
      {
        title: 'TOP BRANDS',
        links: [
          { label: 'Bullpadel', path: '/brand/bullpadel', isBrand: true },
          { label: 'Nox', path: '/brand/nox', isBrand: true },
          { label: 'Babolat', path: '/brand/babolat', isBrand: true },
          { label: 'Head', path: '/brand/head', isBrand: true },
          { label: 'Siux', path: '/brand/siux', isBrand: true },
          { label: 'Adidas', path: '/brand/adidas', isBrand: true },
        ],
      },
    ],
  },
  {
    id: 'apparel',
    label: 'APPAREL',
    path: '/category/apparel',
    megaMenu: [
      {
        title: 'FEATURED',
        links: [{ label: 'All Clothing', path: '/category/apparel' }],
      },
      {
        title: 'MEN & WOMEN',
        links: [
          { label: 'Padel Shorts', path: '/category/shorts' },
          { label: 'T-Shirts & Polos', path: '/category/t-shirts' },
          { label: 'Performance Socks', path: '/category/socks' },
        ],
      },
      {
        title: 'BRANDS IN APPAREL',
        links: [
          { label: 'Adidas', path: '/brand/adidas' },
          { label: 'Bullpadel', path: '/brand/bullpadel' },
          { label: 'Nox', path: '/brand/nox' },
          { label: 'Head', path: '/brand/head' },
        ],
      },
    ],
  },
  {
    id: 'gear',
    label: 'BAGS & GEAR',
    path: '/category/accessories/bags',
    megaMenu: [
      {
        title: 'BAGS',
        links: [{ label: 'All Bags', path: '/category/accessories/bags' }],
      },
      {
        title: 'ACCESSORIES',
        links: [
          { label: 'Overgrips & Protectors', path: '/category/grips' },
          { label: 'Padel Balls', path: '/category/balls' },
          { label: 'Water Bottles', path: '/category/bottles' },
          { label: 'All Accessories', path: '/category/accessories' },
        ],
      },
    ],
  },
  {
    id: 'brands',
    label: 'BRANDS',
    path: '/brands',
    megaMenu: [
      {
        title: 'TOP PADEL BRANDS',
        links: [
          { label: 'Bullpadel', path: '/brand/bullpadel', isBrand: true },
          { label: 'Nox Padel', path: '/brand/nox', isBrand: true },
          { label: 'Babolat', path: '/brand/babolat', isBrand: true },
          { label: 'Head Padel', path: '/brand/head', isBrand: true },
        ],
      },
      {
        title: 'SPORTSWEAR',
        links: [
          { label: 'On Cloud', path: '/brand/on-cloud', isBrand: true },
          { label: 'Adidas', path: '/brand/adidas', isBrand: true },
          { label: 'Siux', path: '/brand/siux', isBrand: true },
        ],
      },
    ],
  },
  {
    id: 'sale',
    label: 'SALE',
    path: '/shop?onSale=1',
    megaMenu: [
      {
        title: 'DEALS BY CATEGORY',
        links: [
          { label: 'Rackets on Sale', path: '/category/rackets?onSale=1' },
          { label: 'Apparel on Sale', path: '/category/apparel?onSale=1' },
          { label: 'Bags & Accessories on Sale', path: '/category/accessories?onSale=1' },
          { label: 'All Sale Items', path: '/shop?onSale=1' },
        ],
      },
    ],
  },
];
