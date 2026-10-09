import * as v from 'valibot';
import {
  MegaMenuLinkSchema,
  MegaMenuColumnSchema,
  NavCategorySchema,
  NavSettingsSchema,
} from './nav.schema';

export type MegaMenuLink = v.InferOutput<typeof MegaMenuLinkSchema>;
export type MegaMenuColumn = v.InferOutput<typeof MegaMenuColumnSchema>;
export type NavCategory = v.InferOutput<typeof NavCategorySchema>;
export type NavSettings = v.InferOutput<typeof NavSettingsSchema>;
