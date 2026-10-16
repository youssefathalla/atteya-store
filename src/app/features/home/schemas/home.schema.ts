import * as v from 'valibot';

export const HeroActionSchema = v.object({
  label: v.pipe(v.string(), v.trim()),
  link: v.pipe(v.string(), v.trim()),
});

export const HomeHeroSchema = v.object({
  headline: v.pipe(v.string(), v.trim()),
  subtitle: v.pipe(v.string(), v.trim()),
  imageUrl: v.pipe(v.string(), v.trim()),
  imageAlt: v.optional(v.pipe(v.string(), v.trim())),
  actions: v.array(HeroActionSchema),
});

export const HomeSettingsSchema = v.object({
  id: v.optional(v.string()),
  hero: HomeHeroSchema,
  updatedAt: v.optional(v.unknown()),
  updatedBy: v.optional(v.string()),
});
