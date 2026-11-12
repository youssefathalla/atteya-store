/**
 * Pure utility functions for Navigation Manager slug and path operations.
 */

export function slugify(text: string): string {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
  while (slug.startsWith('-')) slug = slug.slice(1);
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  return slug;
}

export function normalizePath(rawPath: string): string {
  let path = rawPath.trim();
  if (path && !path.startsWith('/')) path = `/${path}`;
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

/** A published category or brand the storefront can open (`/category/<slug>`, `/brand/<slug>`). */
export interface NavCatalogEntry {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface NavCatalog {
  readonly categories: readonly NavCatalogEntry[];
  readonly brands: readonly NavCatalogEntry[];
}

/** Everyday words staff use for a category whose name is different (stemmed form). */
const LABEL_ALIASES: Readonly<Record<string, string>> = {
  clothing: 'apparel',
  clothe: 'apparel',
};

function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

function wordsOf(text: string): string[] {
  return slugify(text).split('-').filter(Boolean).map(stem);
}

/** Every word of the entry's slug or name appears in the label ("Overgrips" counts for "grips"). */
function entryScore(entry: NavCatalogEntry, labelWords: readonly string[], allowSuffix: boolean): number {
  let best = 0;
  for (const source of [entry.slug, entry.name]) {
    const words = wordsOf(source);
    if (words.length === 0) continue;
    const matches = words.every((word) =>
      labelWords.some(
        (labelWord) => labelWord === word || (allowSuffix && word.length >= 4 && labelWord.endsWith(word)),
      ),
    );
    if (matches) best = Math.max(best, words.join('').length);
  }
  return best;
}

function bestEntry(
  entries: readonly NavCatalogEntry[],
  labelWords: readonly string[],
  allowSuffix: boolean,
): NavCatalogEntry | null {
  let winner: NavCatalogEntry | null = null;
  let winnerScore = 0;
  for (const entry of entries) {
    const score = entryScore(entry, labelWords, allowSuffix);
    if (score > winnerScore) {
      winner = entry;
      winnerScore = score;
    }
  }
  return winner;
}

/**
 * The storefront address for a navigation label, built only from real categories and brands
 * ("Padel Balls" → `/category/balls`, "Nox Padel" → `/brand/nox`, "Apparel on Sale" →
 * `/category/apparel?onSale=1`). Returns null when nothing matches, so the caller never saves
 * a made-up address that opens an empty page.
 */
export function suggestNavPath(label: string, isBrand: boolean, catalog: NavCatalog): string | null {
  const labelWords = wordsOf(label);
  if (labelWords.length === 0) return null;

  const onSale = labelWords.includes('sale');
  const saleQuery = onSale ? '?onSale=1' : '';
  const meaningful = labelWords
    .filter((word) => word !== 'all' && word !== 'sale' && !(onSale && word === 'on'))
    .map((word) => LABEL_ALIASES[word] ?? word);

  if (!onSale && meaningful.length === 1 && meaningful[0] === 'brand') return '/brands';

  const brand = bestEntry(catalog.brands, meaningful, false);
  const category = bestEntry(catalog.categories, meaningful, true);

  if (isBrand && brand) return `/brand/${brand.slug}`;
  if (category) return `/category/${category.slug}${saleQuery}`;
  if (brand) return `/brand/${brand.slug}`;
  if (onSale) return '/shop?onSale=1';
  return null;
}

export function noNavPathMessage(label: string): string {
  return `No category or brand matches "${label.trim()}". Type the address yourself, for example /category/apparel.`;
}
