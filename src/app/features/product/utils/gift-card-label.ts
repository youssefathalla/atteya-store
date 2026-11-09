import { COLOR_PALETTE } from '@core/services/products/catalog-taxonomy';

/** What the label needs from one gift choice. */
export interface GiftCardLabelInput {
  readonly productId: string;
  readonly name: string;
  readonly colors: readonly string[];
}

/** Plain nouns that only make the model name long ("Adidas Simple Polo" -> "Simple"). */
const GENERIC_WORDS = new Set(['polo', 'shirt', 't-shirt', 'tshirt', 'tee', 'socks', 'sock']);

/** The product's one colour word ("White"), or null for no colour or several. */
export function giftColourWord(colors: readonly string[]): string | null {
  if (colors.length !== 1 || colors[0] === 'multi') return null;
  return COLOR_PALETTE.find((entry) => entry.id === colors[0])?.label ?? null;
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** The name without its colour at the end ("Adidas Simple Polo White" -> ["Adidas", "Simple", "Polo"]). */
function nameWords(input: GiftCardLabelInput, colour: string | null): string[] {
  const list = words(input.name);
  if (colour && list.length > 1 && list[list.length - 1].toLowerCase() === colour.toLowerCase()) list.pop();
  return list;
}

/**
 * One short line under each gift card. The colour word when the product has one colour
 * ("White"); the short model name when it has none. When two choices of the same step would
 * read the same, the model name and the colour are joined with " · " ("Siux Tee · Red").
 * The model name drops the words every choice starts with (the brand, when they share it)
 * and plain nouns such as "Polo", so it stays short. Never the full long name.
 */
export function giftCardLabels(choices: readonly GiftCardLabelInput[]): Map<string, string> {
  const colours = choices.map((choice) => giftColourWord(choice.colors));
  const lists = choices.map((choice, index) => nameWords(choice, colours[index]));

  // Words shared by the start of every name (the brand) are dropped when something else is left.
  let shared = 0;
  if (lists.length > 1) {
    const [first, ...rest] = lists;
    while (
      shared < first.length - 1 &&
      rest.every((list) => shared < list.length - 1 && list[shared].toLowerCase() === first[shared].toLowerCase())
    ) {
      shared += 1;
    }
  }

  const models = lists.map((list) => {
    const rest = list.slice(shared);
    const kept = rest.filter((word) => !GENERIC_WORDS.has(word.toLowerCase()));
    return (kept.length > 0 ? kept : rest).join(' ');
  });

  const base = choices.map((_, index) => colours[index] ?? models[index]);
  const result = new Map<string, string>();
  choices.forEach((choice, index) => {
    const duplicated = base.filter((label) => label.toLowerCase() === base[index].toLowerCase()).length > 1;
    const colour = colours[index];
    result.set(choice.productId, duplicated && colour ? `${models[index]} · ${colour}` : base[index]);
  });
  return result;
}
