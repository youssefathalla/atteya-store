import * as v from 'valibot';
import {
  HeroActionSchema,
  HomeHeroSchema,
  HomeSettingsSchema,
} from '../schemas/home.schema';

export type HeroAction = v.InferOutput<typeof HeroActionSchema>;
export type HomeHero = v.InferOutput<typeof HomeHeroSchema>;
export type HomeSettings = v.InferOutput<typeof HomeSettingsSchema>;
