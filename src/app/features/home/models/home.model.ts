import * as v from 'valibot';
import {
  HeroActionSchema,
  HeroLayoutCountSchema,
  HeroSlideSchema,
  HomeHeroSchema,
  HomeSettingsSchema,
} from '../schemas/home.schema';

export type HeroAction = v.InferOutput<typeof HeroActionSchema>;
export type HeroSlide = v.InferOutput<typeof HeroSlideSchema>;
export type HeroLayoutCount = v.InferOutput<typeof HeroLayoutCountSchema>;
export type HomeHero = v.InferOutput<typeof HomeHeroSchema>;
export type HomeSettings = v.InferOutput<typeof HomeSettingsSchema>;

