import * as v from 'valibot';
import {
  HeroActionSchema,
  HeroLayoutCountSchema,
  HeroSlideSchema,
  HomeHeroSchema,
  HomeNavListItemSchema,
  HomeNavListSchema,
  HomeSettingsSchema,
  HomeShopCategoriesSchema,
  ShopCategoryCardSchema,
} from '../schemas/home.schema';

export type HeroAction = v.InferOutput<typeof HeroActionSchema>;
export type HeroSlide = v.InferOutput<typeof HeroSlideSchema>;
export type HeroLayoutCount = v.InferOutput<typeof HeroLayoutCountSchema>;
export type HomeHero = v.InferOutput<typeof HomeHeroSchema>;
export type ShopCategoryCard = v.InferOutput<typeof ShopCategoryCardSchema>;
export type HomeShopCategories = v.InferOutput<typeof HomeShopCategoriesSchema>;
export type HomeNavListItem = v.InferOutput<typeof HomeNavListItemSchema>;
export type HomeNavList = v.InferOutput<typeof HomeNavListSchema>;
export type HomeSettings = v.InferOutput<typeof HomeSettingsSchema>;
