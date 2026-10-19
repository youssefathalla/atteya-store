import * as v from 'valibot';

export const HeroActionSchema = v.object({
  label: v.pipe(v.string(), v.trim()),
  link: v.pipe(v.string(), v.trim()),
});

export const HeroSlideSchema = v.object({
  headline: v.pipe(v.string(), v.trim()),
  subtitle: v.pipe(v.string(), v.trim()),
  imageUrl: v.pipe(v.string(), v.trim()),
  imageAlt: v.optional(v.pipe(v.string(), v.trim()), ''),
  actions: v.array(HeroActionSchema),
});

export const HeroLayoutCountSchema = v.picklist([1, 2, 3]);

const ModernHomeHeroSchema = v.object({
  layoutCount: v.optional(HeroLayoutCountSchema, 1),
  slides: v.array(HeroSlideSchema),
});

const LegacyHomeHeroSchema = v.pipe(
  HeroSlideSchema,
  v.transform((slide) => ({
    layoutCount: 1 as const,
    slides: [slide],
  })),
);

export const HomeHeroSchema = v.union([ModernHomeHeroSchema, LegacyHomeHeroSchema]);

export const ShopCategoryCardSchema = v.object({
  imageUrl: v.pipe(v.string(), v.trim()),
  imageAlt: v.optional(v.pipe(v.string(), v.trim()), ''),
  buttonLabel: v.pipe(v.string(), v.trim()),
  buttonLink: v.pipe(v.string(), v.trim()),
});

export const HomeShopCategoriesSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.trim()), 'Shop'),
  cards: v.array(ShopCategoryCardSchema),
});

export const HomeSettingsSchema = v.object({
  id: v.optional(v.string()),
  hero: HomeHeroSchema,
  shopCategories: v.optional(HomeShopCategoriesSchema),
  updatedAt: v.optional(v.unknown()),
  updatedBy: v.optional(v.string()),
});
