/** Keep in sync with `src/app/core/services/products/search-tokens.ts` (everything above `searchWordsFromTerm`). */

const MAX_TOKENS = 200;
export const MIN_PREFIX_LEN = 2;

/** NFD, strip combining marks (accents), lower case. English/Latin product text only. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** a-z0-9 words after normalizeSearchText(). */
export function searchWords(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

export function buildSearchTokens(name: string, modelGroup: string | null | undefined): readonly string[] {
  const unique = new Set<string>();

  for (const source of [name, modelGroup ?? '']) {
    for (const word of searchWords(source)) {
      unique.add(word);
      for (let len = MIN_PREFIX_LEN; len <= word.length; len++) {
        unique.add(word.slice(0, len));
      }
    }
  }

  const sorted = [...unique].sort((left, right) => left.localeCompare(right));
  if (sorted.length <= MAX_TOKENS) return sorted;
  return sorted.slice(0, MAX_TOKENS);
}
