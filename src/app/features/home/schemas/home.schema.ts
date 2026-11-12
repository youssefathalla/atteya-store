import * as v from 'valibot';
import { IMAGE_LIMITS } from '@shared/utils/image';
import { NavTargetSchema } from '@core/services/navigation/nav-target';

/**
 * Where a home button or link goes (ATS-267), picked in Admin → Home Page like a menu link. The
 * address next to it (`link` / `buttonLink`) is built from it on save, so older readers and the
 * server seed keep working; links saved before targets have no `target` and use their address.
 */
const HomeLinkTargetSchema = v.optional(NavTargetSchema);

/** Keep in sync with `NAV_LIST_MAX_ITEMS` in home.data.ts. */
const NAV_LIST_ITEM_LIMIT = 10;

export const HeroActionSchema = v.object({
  label: v.pipe(v.string(), v.trim()),
  link: v.pipe(v.string(), v.trim()),
  target: HomeLinkTargetSchema,
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
  target: HomeLinkTargetSchema,
});

export const HomeShopCategoriesSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.trim()), 'Shop'),
  cards: v.array(ShopCategoryCardSchema),
});

export const HomeNavListItemSchema = v.object({
  label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  link: v.pipe(
    v.string(),
    v.trim(),
    v.check((value) => value.startsWith('/') && !value.startsWith('//'), 'Link must start with /'),
  ),
  imageUrl: v.pipe(v.string(), v.trim()),
  imageAlt: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(IMAGE_LIMITS.maxAltLength)), ''),
  target: HomeLinkTargetSchema,
});

export const HomeNavListSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.trim()), 'Shop by category'),
  items: v.pipe(v.array(HomeNavListItemSchema), v.maxLength(NAV_LIST_ITEM_LIMIT)),
});

export const HomeSettingsSchema = v.object({
  id: v.optional(v.string()),
  hero: HomeHeroSchema,
  shopCategories: v.optional(HomeShopCategoriesSchema),
  navList: v.optional(HomeNavListSchema),
  updatedAt: v.optional(v.unknown()),
  updatedBy: v.optional(v.string()),
});
