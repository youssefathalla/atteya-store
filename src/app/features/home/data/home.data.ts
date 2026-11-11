import {
  HeroSlide,
  HomeHero,
  HomeNavList,
  HomeNavListItem,
  HomeShopCategories,
  ShopCategoryCard,
} from '../models/home.model';

export const DEFAULT_HERO_SLIDES: readonly HeroSlide[] = [
  {
    headline: 'Performance-grade gear.',
    subtitle: 'Apparel built for however you train.',
    imageUrl: '',
    imageAlt: 'Athlete training in performance sportswear',
    actions: [
      { label: "Shop men's", link: '/category/apparel?gender=men' },
      { label: "Shop women's", link: '/category/apparel?gender=women' },
    ],
  },
  {
    headline: 'Dominate the court.',
    subtitle: 'Precision-engineered padel rackets and pro accessories.',
    imageUrl: '',
    imageAlt: 'Padel player preparing to serve on court',
    actions: [{ label: 'Shop rackets', link: '/category/rackets' }],
  },
  {
    headline: 'Carry the kit.',
    subtitle: 'Court bags and gear that keep everything ready to play.',
    imageUrl: '',
    imageAlt: 'Padel bag packed with rackets and court gear',
    actions: [{ label: 'Shop bags', link: '/category/bags' }],
  },
];

export const DEFAULT_HOME_HERO: HomeHero = {
  layoutCount: 3,
  slides: [
    { ...DEFAULT_HERO_SLIDES[0], actions: [...DEFAULT_HERO_SLIDES[0].actions] },
    { ...DEFAULT_HERO_SLIDES[1], actions: [...DEFAULT_HERO_SLIDES[1].actions] },
    { ...DEFAULT_HERO_SLIDES[2], actions: [...DEFAULT_HERO_SLIDES[2].actions] },
  ],
};

export const SHOP_CATEGORIES_CARD_COUNT = 3;

export const DEFAULT_SHOP_CATEGORY_CARDS: readonly ShopCategoryCard[] = [
  {
    imageUrl: '',
    imageAlt: 'Professional padel rackets ready for court play',
    buttonLabel: 'Rackets',
    buttonLink: '/category/rackets',
  },
  {
    imageUrl: '',
    imageAlt: 'Lightweight breathable training apparel',
    buttonLabel: 'Apparel',
    buttonLink: '/category/apparel',
  },
  {
    imageUrl: '',
    imageAlt: 'Pro padel bags, caps, and athletic accessories',
    buttonLabel: 'Accessories',
    buttonLink: '/category/accessories',
  },
];

export const DEFAULT_HOME_SHOP_CATEGORIES: HomeShopCategories = {
  title: 'Shop',
  cards: DEFAULT_SHOP_CATEGORY_CARDS.map((card) => ({ ...card })),
};

export const NAV_LIST_MAX_ITEMS = 10;

const DEFAULT_NAV_LIST_ITEMS: readonly HomeNavListItem[] = [
  { label: 'Rackets', link: '/category/rackets', imageUrl: '', imageAlt: '' },
  { label: 'Bags', link: '/category/accessories/bags', imageUrl: '', imageAlt: '' },
  { label: 'Accessories', link: '/category/accessories', imageUrl: '', imageAlt: '' },
  { label: 'Socks', link: '/category/socks', imageUrl: '', imageAlt: '' },
  { label: 'Shorts', link: '/category/shorts', imageUrl: '', imageAlt: '' },
  { label: 'Shop all', link: '/shop', imageUrl: '', imageAlt: '' },
];

export const DEFAULT_HOME_NAV_LIST: HomeNavList = {
  title: 'Shop by category',
  items: DEFAULT_NAV_LIST_ITEMS.map((item) => ({ ...item })),
};
