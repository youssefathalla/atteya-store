/** Keep in sync with `functions/src/products/search-tokens.ts`. */

const MAX_TOKENS = 200;
const MIN_PREFIX_LEN = 2;

export function buildSearchTokens(
  name: string,
  modelGroup: string | null | undefined,
): readonly string[] {
  const unique = new Set<string>();

  for (const source of [name, modelGroup ?? '']) {
    const words = source.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
    for (const word of words) {
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
  return term
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

export function longestSearchWord(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  return words.reduce((longest, word) => (word.length > longest.length ? word : longest), words[0]);
}
