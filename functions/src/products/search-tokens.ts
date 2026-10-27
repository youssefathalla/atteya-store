/** Keep in sync with `src/app/core/services/products/search-tokens.ts` (everything above `searchWordsFromTerm`). */

const MAX_TOKENS = 200;
export const MIN_PREFIX_LEN = 2;

const ARABIC_FOLDS: Readonly<Record<string, string>> = { 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه' };

/**
 * Search text: NFD, no combining marks (tashkeel, hamza marks, accents) or tatweel,
 * one alef / ya / ha form, Western digits, lower case.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\p{M}\u0640]/gu, '')
    .replace(/[ٱىة]/g, (char) => ARABIC_FOLDS[char] ?? char)
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .toLowerCase();
}

/** Words of letters or numbers in any script, after normalizeSearchText(). */
export function searchWords(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

export function buildSearchTokens(
  name: string,
  modelGroup: string | null | undefined,
): readonly string[] {
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
