import { HeroSlide, HomeHero } from '../models/home.model';

export const DEFAULT_HERO_SLIDES: readonly HeroSlide[] = [
  {
    headline: 'Performance-grade gear.',
    subtitle: 'Apparel and shoes for however you train.',
    imageUrl: '',
    imageAlt: 'Athlete training in sportswear and athletic shoes',
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
    actions: [
      { label: 'Shop rackets', link: '/category/rackets' },
    ],
  },
  {
    headline: 'Built for movement.',
    subtitle: 'Court-ready footwear designed for explosive agility.',
    imageUrl: '',
    imageAlt: 'Close-up of court performance footwear',
    actions: [
      { label: 'Shop footwear', link: '/category/footwear' },
    ],
  },
];

export const DEFAULT_HOME_HERO: HomeHero = {
  layoutCount: 1,
  slides: [{ ...DEFAULT_HERO_SLIDES[0], actions: [...DEFAULT_HERO_SLIDES[0].actions] }],
};
