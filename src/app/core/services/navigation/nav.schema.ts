import * as v from 'valibot';
import { NavTargetSchema } from './nav-target';

export const MegaMenuLinkSchema = v.object({
  label: v.string(),
  /** Always saved; built from `target` by the editor, so readers of `path` keep working. */
  path: v.string(),
  /** What the link points at (ATS-246); missing on links saved before it. */
  target: v.fallback(v.optional(NavTargetSchema), undefined),
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
  /** What the menu name opens; no target and no path = it only opens the menu. */
  target: v.fallback(v.optional(NavTargetSchema), undefined),
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
