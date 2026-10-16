import { HomeHero } from '../models/home.model';

export const DEFAULT_HOME_HERO: HomeHero = {
  headline: 'Performance-grade gear.',
  subtitle: 'Apparel and shoes for however you train.',
  imageUrl: 'hero/default-hero.jpg',
  imageAlt: 'Athlete training in sportswear and athletic shoes',
  actions: [
    { label: "Shop men's", link: '/category/apparel?gender=men' },
    { label: "Shop women's", link: '/category/apparel?gender=women' },
  ],
};
