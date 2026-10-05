import { NavCategory } from './navbar.model';

export const NAV_CATEGORIES: readonly NavCategory[] = [
  {
    id: 'rackets',
    label: 'RACKETS',
    path: '/category/rackets',
    megaMenu: [
      {
        title: 'HIGHLIGHTS',
        links: [
          { label: 'New Arrivals 2026', path: '/category/rackets/new', badge: 'NEW' },
          { label: 'Best Sellers', path: '/category/rackets/best-sellers' },
          { label: 'Pro Player Edition', path: '/category/rackets/pro' },
          { label: 'Padel Bundles', path: '/category/bundles', badge: 'SAVE' },
          { label: 'All Rackets', path: '/category/rackets' },
        ],
      },
      {
        title: 'PLAYING STYLE',
        links: [
          { label: 'Diamond (Power)', path: '/category/rackets?shape=diamond' },
          { label: 'Teardrop (Balanced)', path: '/category/rackets?shape=teardrop' },
          { label: 'Round (Control)', path: '/category/rackets?shape=round' },
          { label: 'Junior Rackets', path: '/category/rackets?level=junior' },
          { label: 'Beginner / Intermediate', path: '/category/rackets?level=beginner' },
        ],
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
    featuredCard: {
      tag: 'NEW RELEASE',
      title: 'Bullpadel Vertex 04',
      subtitle: 'The ultimate power racket for tournament champions.',
      linkText: 'EXPLORE RACKET',
      path: '/brand/bullpadel',
    },
  },
  {
    id: 'apparel',
    label: 'APPAREL',
    path: '/category/apparel',
    megaMenu: [
      {
        title: 'FEATURED',
        links: [
          { label: 'New In Clothing', path: '/category/apparel/new' },
          { label: 'Best Sellers', path: '/category/apparel/best-sellers' },
          { label: 'Team Uniforms', path: '/category/apparel/teams' },
          { label: 'All Clothing', path: '/category/apparel' },
        ],
      },
      {
        title: 'MEN & WOMEN',
        links: [
          { label: 'Zipped Hoodies', path: '/category/hoodies', badge: 'POPULAR' },
          { label: 'Padel Shorts', path: '/category/shorts' },
          { label: 'T-Shirts & Polos', path: '/category/t-shirts' },
          { label: 'Tracksuits & Pants', path: '/category/tracksuits' },
          { label: 'Performance Socks', path: '/category/socks' },
        ],
      },
      {
        title: 'BRANDS IN APPAREL',
        links: [
          { label: 'Adidas Padel', path: '/brand/adidas' },
          { label: 'Bullpadel Wear', path: '/brand/bullpadel' },
          { label: 'Nox Performance', path: '/brand/nox' },
          { label: 'Head Sports', path: '/brand/head' },
        ],
      },
    ],
    featuredCard: {
      tag: 'PRO SERIES',
      title: 'Court Ready Apparel',
      subtitle: 'Engineered for high performance, breathability and durability.',
      linkText: 'SHOP APPAREL',
      path: '/category/apparel',
    },
  },
  {
    id: 'shoes',
    label: 'SHOES',
    path: '/category/shoes',
    megaMenu: [
      {
        title: 'HIGHLIGHTS',
        links: [
          { label: 'New Footwear Arrivals', path: '/category/shoes/new' },
          { label: 'Clay Court Specialists', path: '/category/shoes?sole=clay' },
          { label: 'Omni Court Soles', path: '/category/shoes?sole=omni' },
          { label: 'All Shoes', path: '/category/shoes' },
        ],
      },
      {
        title: 'BRANDS',
        links: [
          { label: 'On Cloud', path: '/brand/on-cloud', badge: 'HOT', isBrand: true },
          { label: 'Adidas Court', path: '/brand/adidas', isBrand: true },
          { label: 'Bullpadel Shoes', path: '/brand/bullpadel', isBrand: true },
          { label: 'Babolat Jet', path: '/brand/babolat', isBrand: true },
          { label: 'Head Motion', path: '/brand/head', isBrand: true },
        ],
      },
      {
        title: 'FOOTWEAR CARE',
        links: [
          { label: 'Technical Padel Socks', path: '/category/socks' },
          { label: 'Shoe Bags', path: '/category/bags?type=shoe-bag' },
          { label: 'Replacement Insoles', path: '/category/accessories?type=insoles' },
        ],
      },
    ],
    featuredCard: {
      tag: 'FEATURED',
      title: 'On Cloud Padel',
      subtitle: 'Unrivaled cushioning and lightweight responsiveness on court.',
      linkText: 'DISCOVER ON CLOUD',
      path: '/brand/on-cloud',
    },
  },
  {
    id: 'gear',
    label: 'BAGS & GEAR',
    path: '/category/bags',
    megaMenu: [
      {
        title: 'BAGS',
        links: [
          { label: 'Paleteros (Racket Bags)', path: '/category/bags?type=paletero', badge: 'TOP' },
          { label: 'Padel Backpacks', path: '/category/bags?type=backpack' },
          { label: 'Duffel Bags', path: '/category/bags?type=duffel' },
          { label: 'All Bags', path: '/category/bags' },
        ],
      },
      {
        title: 'ACCESSORIES',
        links: [
          { label: 'Overgrips & Protectors', path: '/category/accessories?type=grips' },
          { label: 'Padel Balls (Cans & Boxes)', path: '/category/accessories?type=balls' },
          { label: 'Wristbands & Headbands', path: '/category/accessories?type=wristbands' },
          { label: 'Caps & Visors', path: '/category/accessories?type=caps' },
          { label: 'Water Bottles', path: '/category/accessories?type=bottles' },
        ],
      },
      {
        title: 'BUNDLES & PACKS',
        links: [
          { label: 'Racket + Bag Bundles', path: '/category/bundles?type=starter', badge: 'VALUE' },
          { label: 'Ball Multi-packs', path: '/category/accessories?type=balls-bulk' },
          { label: 'Overgrip Tins (60 pcs)', path: '/category/accessories?type=grips-bulk' },
        ],
      },
    ],
    featuredCard: {
      tag: 'BEST VALUE',
      title: 'Tour Bundles',
      subtitle: 'Complete tournament sets: Racket, thermo paletero, and grip set.',
      linkText: 'SHOP BUNDLES',
      path: '/category/bundles',
    },
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
        title: 'SPORTSWEAR & FOOTWEAR',
        links: [
          { label: 'On Cloud', path: '/brand/on-cloud', isBrand: true },
          { label: 'Adidas', path: '/brand/adidas', isBrand: true },
          { label: 'Siux', path: '/brand/siux', isBrand: true },
          { label: 'Puma', path: '/brand/puma', isBrand: true },
        ],
      },
      {
        title: 'DISCOVER',
        links: [
          { label: 'All Brands Directory', path: '/brands' },
          { label: 'Official Warranty Partners', path: '/about/warranty' },
          { label: 'Brand Size Guides', path: '/size-guide' },
        ],
      },
    ],
    featuredCard: {
      tag: 'OFFICIAL DEALER',
      title: '100% Genuine Gear',
      subtitle: 'Authorized retailer for premier padel & performance brands.',
      linkText: 'VIEW ALL BRANDS',
      path: '/brands',
    },
  },
  {
    id: 'sale',
    label: 'SALE',
    path: '/category/sale',
    isHighlight: true,
    megaMenu: [
      {
        title: 'DEALS BY CATEGORY',
        links: [
          { label: 'Rackets on Sale (Up to 40% Off)', path: '/category/sale?cat=rackets', badge: '40% OFF' },
          { label: 'Apparel Clearance', path: '/category/sale?cat=apparel' },
          { label: 'Shoes Outlet', path: '/category/sale?cat=shoes' },
          { label: 'Bags & Accessories Deals', path: '/category/sale?cat=accessories' },
          { label: 'All Sale Items', path: '/category/sale' },
        ],
      },
      {
        title: 'SPECIAL PACKS',
        links: [
          { label: 'Super Bundles', path: '/category/bundles', badge: 'BEST BUY' },
          { label: 'Last Season Stock', path: '/category/sale?type=outlet' },
          { label: 'Flash Deals', path: '/category/sale?type=flash' },
        ],
      },
    ],
    featuredCard: {
      tag: 'LIMITED TIME',
      title: 'Mid-Season Clearance',
      subtitle: 'Save up to 50% on top rackets, footwear and pro accessories.',
      linkText: 'SHOP THE SALE',
      path: '/category/sale',
    },
  },
];
