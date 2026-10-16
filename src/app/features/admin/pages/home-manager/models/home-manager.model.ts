import { HomeHero, HeroAction } from '@features/home/models/home.model';

export type HomeSectionTab = 'hero' | 'categories' | 'featured';

export interface ActionMoveEvent {
  readonly index: number;
  readonly direction: 'up' | 'down';
}

export type { HomeHero, HeroAction };
