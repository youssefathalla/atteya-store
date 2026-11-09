/** Keep in sync with `functions/src/products/search-tokens.ts` (everything above `searchWordsFromTerm`). */

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

export function searchWordsFromTerm(term: string): string[] {
  return searchWords(term.trim());
}

export function longestSearchWord(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  return words.reduce((longest, word) => (word.length > longest.length ? word : longest), words[0]);
}

/** Every word must be a token; a word shorter than MIN_PREFIX_LEN matches any token that starts with it. */
export function matchesSearchWords(tokens: readonly string[], words: readonly string[]): boolean {
  return words.every((word) =>
    word.length >= MIN_PREFIX_LEN ? tokens.includes(word) : tokens.some((token) => token.startsWith(word)),
  );
}

/** True when there are words but none has MIN_PREFIX_LEN letters, so there's nothing to look up. */
export function isSearchTooShort(words: readonly string[]): boolean {
  const anchor = longestSearchWord(words);
  return anchor !== null && anchor.length < MIN_PREFIX_LEN;
}
