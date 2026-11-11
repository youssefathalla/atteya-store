import { HttpsError } from 'firebase-functions/v2/https';

/** Shown when a bag line still holds a choice its product no longer offers. */
export const ITEM_CHANGED =
  'One item in your bag has changed since you added it. Remove it and add it again.';

/**
 * Choice keys on a bag line that the product no longer has as an option (an option staff removed
 * after the shopper added it, such as the bag bundles' old "Free shirt" and shirt size, ATS-74).
 */
export function staleSelectionKeys(options: unknown, selection: Readonly<Record<string, string>>): string[] {
  const keys = new Set<string>();
  if (Array.isArray(options)) {
    for (const option of options) {
      if (option && typeof option['key'] === 'string') keys.add(option['key']);
    }
  }
  return Object.keys(selection).filter((key) => !keys.has(key));
}

/**
 * Refuses a line with a stale choice instead of quietly dropping it: the line was added for a
 * product that has changed since (a removed size would also leave a sized and an unsized line for
 * one product, which confirm can't take from stock), and adding it again from the product page
 * picks up what the product offers now, free gifts included.
 */
export function assertCurrentSelection(options: unknown, selection: Readonly<Record<string, string>>): void {
  if (staleSelectionKeys(options, selection).length > 0) {
    throw new HttpsError('failed-precondition', ITEM_CHANGED);
  }
}
