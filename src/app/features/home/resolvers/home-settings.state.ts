import { makeStateKey } from '@angular/core';
import type { HomeHero, HomeNavList, HomeSettings, HomeShopCategories } from '../models/home.model';

/** Plain settings carried from the server render into the browser. No timestamps. */
export interface HomeSettingsSeed {
  readonly hero: HomeHero;
  readonly shopCategories?: HomeShopCategories;
  readonly navList?: HomeNavList;
}

export const HOME_SETTINGS_KEY = makeStateKey<HomeSettingsSeed | null>('home-settings');

export function toHomeSettingsSeed(settings: HomeSettings): HomeSettingsSeed {
  return {
    hero: settings.hero,
    ...(settings.shopCategories ? { shopCategories: settings.shopCategories } : {}),
    ...(settings.navList ? { navList: settings.navList } : {}),
  };
}
