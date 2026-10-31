import { makeStateKey } from '@angular/core';
import type { NavCategory, NavSettings } from './nav.model';

/** JSON-safe navigation settings for TransferState. */
export interface NavigationSettingsSeed {
  readonly categories: readonly NavCategory[];
}

export const NAVIGATION_SETTINGS_KEY = makeStateKey<NavigationSettingsSeed | null>(
  'navigation-settings',
);

export function toNavigationSettingsSeed(doc: NavSettings): NavigationSettingsSeed {
  return { categories: doc.categories };
}

export function navigationSeedToDoc(seed: NavigationSettingsSeed): NavSettings {
  return {
    id: 'navigation',
    categories: [...seed.categories],
    version: 1,
  };
}
