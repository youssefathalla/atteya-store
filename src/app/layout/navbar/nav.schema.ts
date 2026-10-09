import * as v from 'valibot';

export const MegaMenuLinkSchema = v.object({
  label: v.string(),
  path: v.string(),
  badge: v.optional(v.string()),
  isBrand: v.optional(v.boolean()),
});

export const MegaMenuColumnSchema = v.object({
  title: v.optional(v.string()),
  links: v.array(MegaMenuLinkSchema),
});
export const NavCategorySchema = v.object({
  id: v.string(),
  label: v.string(),
  path: v.optional(v.string()),
  isHighlight: v.optional(v.boolean()),
  megaMenu: v.optional(v.array(MegaMenuColumnSchema)),
});

export const NavSettingsSchema = v.object({
  id: v.optional(v.string()),
  categories: v.array(NavCategorySchema),
  version: v.optional(v.number()),
  updatedAt: v.optional(v.unknown()),
  updatedBy: v.optional(v.string()),
});
