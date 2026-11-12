/**
 * Pure rules for the Previous Versions history of `settings/navigation` and `settings/home`
 * (ATS-251): which docs keep history, how many versions stay, and the short summary staff see.
 * Tested in settings-history.test.ts. The trigger lives in settings-history.trigger.ts.
 */

/** Settings docs whose replaced versions are kept. */
export const SETTINGS_HISTORY_DOCS = ['navigation', 'home'] as const;
export type SettingsHistoryDocId = (typeof SETTINGS_HISTORY_DOCS)[number];

/** Root collection: `settingsHistory/{docId}/versions/{versionId}`. */
export const SETTINGS_HISTORY_COLLECTION = 'settingsHistory';
export const SETTINGS_VERSIONS_SUBCOLLECTION = 'versions';

/** Newest versions kept per doc; older ones are deleted by the same trigger run. */
export const MAX_SETTINGS_VERSIONS = 30;

export function isSettingsHistoryDoc(docId: string): docId is SettingsHistoryDocId {
  return (SETTINGS_HISTORY_DOCS as readonly string[]).includes(docId);
}

type Data = Record<string, unknown>;

function asRecord(value: unknown): Data | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "6 menus, 41 links" (links in columns that don't fill themselves). */
export function navigationSummary(data: Data): string {
  const categories = asArray(data['categories']);
  let links = 0;
  for (const category of categories) {
    for (const column of asArray(asRecord(category)?.['megaMenu'])) {
      const col = asRecord(column);
      if (!col || col['auto']) continue;
      links += asArray(col['links']).length;
    }
  }
  return `${count(categories.length, 'menu', 'menus')}, ${count(links, 'link', 'links')}`;
}

/** Hero slides shown: `layoutCount` (1 to 3) for the current shape, 1 for the old single-slide shape. */
function heroSlides(hero: Data | null): number {
  if (!hero) return 0;
  const slides = asArray(hero['slides']);
  if (slides.length === 0) return typeof hero['headline'] === 'string' ? 1 : 0;
  const layout = hero['layoutCount'];
  const shown = typeof layout === 'number' && layout >= 1 && layout <= 3 ? layout : 1;
  return Math.min(shown, slides.length);
}

/** "3 hero slides, 3 shop cards, 6 category links". */
export function homeSummary(data: Data): string {
  const slides = heroSlides(asRecord(data['hero']));
  const cards = asArray(asRecord(data['shopCategories'])?.['cards']).length;
  const items = asArray(asRecord(data['navList'])?.['items']).length;
  return [
    count(slides, 'hero slide', 'hero slides'),
    count(cards, 'shop card', 'shop cards'),
    count(items, 'category link', 'category links'),
  ].join(', ');
}

export function settingsSummary(docId: SettingsHistoryDocId, data: Data): string {
  return docId === 'navigation' ? navigationSummary(data) : homeSummary(data);
}

/** The uid that saved a version (`updatedBy`), or null when it wasn't recorded. */
export function savedByUid(data: Data): string | null {
  const uid = data['updatedBy'];
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128 ? uid : null;
}

/** Ids past the newest `keep`, given ids ordered newest first. */
export function versionsToPrune(idsNewestFirst: readonly string[], keep = MAX_SETTINGS_VERSIONS): string[] {
  return idsNewestFirst.slice(Math.max(0, keep));
}
