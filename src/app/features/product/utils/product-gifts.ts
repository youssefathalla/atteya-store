import type { GiftChoiceView, GiftSizeView } from '@core/services/cart/cart-gifts';
import type { CartLineGift } from '@core/services/cart/cart.model';
import type { GiftChoiceFacts, ProductGiftOffer } from '@core/services/offers/engine';
import type { ProductTypeId } from '@core/services/products';
import type { ChoicePrompt } from '../models/product-page.model';

export { toGiftChoice, type GiftChoiceView, type GiftSizeView } from '@core/services/cart/cart-gifts';

/** One gift of the offer ("Free shirt") with what it can be. */
export interface GiftView {
  readonly id: string;
  readonly name: string;
  /** The thing itself, lower case: "shirt" for "Free shirt". */
  readonly noun: string;
  readonly choices: readonly GiftChoiceView[];
}

/** Everything the Gift Box shows for one product. */
export interface GiftBoxView {
  readonly offerId: string;
  /** "Free shirt and socks with this bag". */
  readonly heading: string;
  readonly gifts: readonly GiftView[];
}

/** What the shopper picked for one gift. */
export interface GiftPick {
  readonly productId: string;
  readonly sizeId: string | null;
}

/** Gift id -> pick. */
export type GiftPicks = Readonly<Record<string, GiftPick>>;

/** One numbered step of the Gift Box: choose the gift, or choose its size. */
export type GiftStep =
  | {
      readonly kind: 'gift';
      readonly key: string;
      readonly number: number;
      readonly title: string;
      readonly gift: GiftView;
      /** Label of the chosen product, or null. */
      readonly chosen: string | null;
    }
  | {
      readonly kind: 'size';
      readonly key: string;
      readonly number: number;
      readonly title: string;
      readonly gift: GiftView;
      readonly sizes: readonly GiftSizeView[];
      readonly chosen: string | null;
    };

/** Prompt key for a gift's product step and size step (never clashes with option keys). */
export const giftStepKey = (giftId: string): string => `gift:${giftId}`;
export const giftSizeStepKey = (giftId: string): string => `gift-size:${giftId}`;

/** What follows "with" in the heading. Plural products read "these". */
const PRODUCT_NOUN_PHRASE: Readonly<Record<ProductTypeId, string>> = {
  rackets: 'this racket',
  bags: 'this bag',
  't-shirts': 'this shirt',
  shorts: 'these shorts',
  socks: 'these socks',
  sets: 'this set',
  grips: 'this grip',
  balls: 'these balls',
  bottles: 'this bottle',
  supports: 'this support',
};

/** "This racket", "These shorts": the product being viewed, as the Bundle & Save section names it. */
export function thisProductPhrase(productType: ProductTypeId): string {
  const phrase = PRODUCT_NOUN_PHRASE[productType] ?? 'this item';
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Facts the engine needs to pick the live gift offer: every listed choice can be given. */
export function giftChoiceFacts(choices: readonly GiftChoiceView[]): GiftChoiceFacts[] {
  return choices.map((choice) => ({ productId: choice.productId, published: true, inStock: true }));
}

/** "Free shirt" -> "shirt"; "Socks" -> "socks". */
export function giftNoun(name: string): string {
  const noun = name.trim().replace(/^free\s+/i, '');
  return (noun || 'gift').toLowerCase();
}

/** "a", "a and b", "a, b and c". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The Gift Box for one product, or null when the offer has no gift that can be given. */
export function buildGiftBox(
  offer: ProductGiftOffer,
  choices: readonly GiftChoiceView[],
  productType: ProductTypeId,
): GiftBoxView | null {
  const byId = new Map(choices.map((choice) => [choice.productId, choice]));
  const gifts: GiftView[] = [];
  for (const gift of offer.gifts) {
    const giftChoices = gift.productIds.flatMap((id) => {
      const choice = byId.get(id);
      return choice ? [choice] : [];
    });
    if (giftChoices.length === 0) continue;
    gifts.push({
      id: gift.id,
      name: gift.name.trim(),
      noun: giftNoun(gift.name),
      choices: giftChoices,
    });
  }
  if (gifts.length === 0) return null;
  const nouns = gifts.map((gift) => gift.noun);
  const phrase = PRODUCT_NOUN_PHRASE[productType] ?? 'this item';
  return { offerId: offer.offerId, heading: `Free ${joinNames(nouns)} with ${phrase}`, gifts };
}

/**
 * The picks that still hold: a product the gift still offers, a size that is still listed.
 * A gift with only one choice and no sizes is picked for the shopper.
 */
export function effectiveGiftPicks(box: GiftBoxView, picks: GiftPicks): GiftPicks {
  const result: Record<string, GiftPick> = {};
  for (const gift of box.gifts) {
    const pick = picks[gift.id];
    const choice = pick ? gift.choices.find((entry) => entry.productId === pick.productId) : undefined;
    if (pick && choice) {
      const sizeId =
        choice.sizes && pick.sizeId && choice.sizes.some((size) => size.id === pick.sizeId)
          ? pick.sizeId
          : null;
      result[gift.id] = { productId: choice.productId, sizeId };
    } else if (gift.choices.length === 1 && gift.choices[0].sizes === null) {
      result[gift.id] = { productId: gift.choices[0].productId, sizeId: null };
    }
  }
  return result;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The numbered steps: one per gift, plus a size step once a gift with sizes is chosen. */
export function giftSteps(box: GiftBoxView, picks: GiftPicks): GiftStep[] {
  const steps: GiftStep[] = [];
  for (const gift of box.gifts) {
    const pick = picks[gift.id];
    const choice = pick ? gift.choices.find((entry) => entry.productId === pick.productId) : undefined;
    steps.push({
      kind: 'gift',
      key: giftStepKey(gift.id),
      number: steps.length + 1,
      title: `Your free ${gift.noun}`,
      gift,
      chosen: choice?.label ?? null,
    });
    if (choice?.sizes) {
      steps.push({
        kind: 'size',
        key: giftSizeStepKey(gift.id),
        number: steps.length + 1,
        title: `${capitalise(gift.noun)} size`,
        gift,
        sizes: choice.sizes,
        chosen: choice.sizes.find((size) => size.id === pick?.sizeId)?.label ?? null,
      });
    }
  }
  return steps;
}

/** The first gift step still open, as the prompt Add to Bag shows; null when every gift is chosen. */
export function missingGiftPrompt(box: GiftBoxView, picks: GiftPicks, attempt: number): ChoicePrompt | null {
  for (const gift of box.gifts) {
    const pick = picks[gift.id];
    if (!pick) {
      return { key: giftStepKey(gift.id), message: `Choose your free ${gift.noun} first.`, attempt };
    }
    const choice = gift.choices.find((entry) => entry.productId === pick.productId);
    if (choice?.sizes && !pick.sizeId) {
      return {
        key: giftSizeStepKey(gift.id),
        message: `Choose a size for your free ${gift.noun} first.`,
        attempt,
      };
    }
  }
  return null;
}

/** The bag line's gifts, or null while a gift is still open. */
export function cartLineGifts(box: GiftBoxView, picks: GiftPicks): CartLineGift[] | null {
  if (missingGiftPrompt(box, picks, 0)) return null;
  return box.gifts.map((gift) => ({
    offerId: box.offerId,
    giftId: gift.id,
    productId: picks[gift.id].productId,
    sizeId: picks[gift.id].sizeId,
  }));
}
