import {
  HeroAction,
  HeroLayoutCount,
  HeroSlide,
  HomeHero,
} from '@features/home/models/home.model';

export type HomeSectionTab = 'hero' | 'categories' | 'featured';

export interface ActionMoveEvent {
  readonly index: number;
  readonly direction: 'up' | 'down';
}

export type { HomeHero, HeroAction, HeroSlide, HeroLayoutCount };

