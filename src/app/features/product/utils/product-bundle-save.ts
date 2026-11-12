import type { GiftChoiceView } from '@core/services/cart/cart-gifts';
import {
  bundleSetOffersForItem,
  bundleSetSlotFits,
  bundleSetSlots,
  type Offer,
  type OfferBundleSetReward,
  type OfferBundleSlot,
  type PricingContext,
} from '@core/services/offers/engine';
import type { ChoicePrompt } from '../models/product-page.model';
import { type BundleChoice, type BundleItemFacts, type BundlePicks, choicesThatFit } from './product-bundle';

/** The Bundle & Save offer on this product: its groups, and the group this product fills. */
export interface ProductBundleSave {
  readonly offer: Offer;
  readonly slots: readonly OfferBundleSlot[];
  readonly setReward: OfferBundleSetReward;
  /** Index in `slots` of the group the product being viewed fills. */
  readonly ownSlot: number;
}

/** One piece of the set: which group, and which piece of that group (0 for the first). */
export interface BundleSavePiece {
  readonly slot: number;
  readonly n: number;
}

/** One step of the Bundle & Save section. */
export type BundleSaveStep =
  | {
      /** The product being viewed: no choice here, just "This racket" (✓ once its own choices are made). */
      readonly kind: 'own';
      readonly key: string;
      readonly piece: number;
      readonly title: string;
      readonly text: string;
      /** Its size and gifts above are chosen. */
      readonly done: boolean;
      readonly pickedId: string;
    }
  | {
      readonly kind: 'piece';
      readonly key: string;
      readonly piece: number;
      readonly title: string;
      readonly choices: readonly GiftChoiceView[];
      readonly pickedId: string | null;
      /** "Choose a bag first." */
      readonly message: string;
    }
  | {
      readonly kind: 'size';
      readonly key: string;
      readonly piece: number;
      readonly title: string;
      readonly sizes: NonNullable<GiftChoiceView['sizes']>;
      readonly pickedId: string | null;
      readonly chosen: string | null;
      /** "Choose a size for the bag first." */
      readonly message: string;
    };

/** Prompt keys of a set piece's steps (never clash with option, gift or Bundle price keys). */
export const bundleSaveStepKey = (piece: number): string => `set:${piece}`;
export const bundleSaveSizeStepKey = (piece: number): string => `set-size:${piece}`;

/**
 * The Bundle & Save offer the bag would put this item in (`bundleSetOffersForItem`: the bag's own
 * rules and order), with the group the item fills, skipping offers `canShow` refuses (one Shop
 * can't list has no other products to pick). Pass the item with `variant: null` so the offer and
 * the group stay put while the shopper changes size; `bundleSaveSizeFits()` checks the size.
 */
export function bundleSaveForProduct(
  item: BundleItemFacts,
  offers: readonly Offer[],
  ctx: PricingContext,
  canShow: (offer: Offer) => boolean,
): ProductBundleSave | null {
  for (const offer of bundleSetOffersForItem(offers, ctx, item)) {
    if (offer.reward.kind !== 'bundleSet' || !canShow(offer)) continue;
    const slots = bundleSetSlots(offer.reward);
    const ownSlot = slots.findIndex((slot) => bundleSetSlotFits(offer, slot, item));
    if (ownSlot >= 0) return { offer, slots, setReward: offer.reward.setReward, ownSlot };
  }
  return null;
}

/** True when this product's chosen size or colour (`item.variant`) still fits its own group. */
export function bundleSaveSizeFits(bundle: ProductBundleSave, item: BundleItemFacts): boolean {
  const slot = bundle.slots[bundle.ownSlot];
  return !!slot && bundleSetSlotFits(bundle.offer, slot, item);
}

/** Every piece of one set in group order ("Racket", "Ball 1", "Ball 2", "Bag"). */
export function bundleSavePieces(slots: readonly OfferBundleSlot[]): BundleSavePiece[] {
  return slots.flatMap((slot, index) =>
    Array.from({ length: slot.quantity }, (_, n) => ({ slot: index, n })),
  );
}

/** The piece the product being viewed fills: the first piece of its group. */
export function ownPieceIndex(bundle: ProductBundleSave): number {
  return bundleSavePieces(bundle.slots).findIndex((piece) => piece.slot === bundle.ownSlot && piece.n === 0);
}

/**
 * The products that can fill one group, at most `max`, with only the sizes the bag would count
 * there (the bag's own rules: offer and group rules, size or colour, sale items).
 */
export function bundleSaveSlotChoices(
  choices: readonly BundleChoice[],
  offer: Offer,
  slot: OfferBundleSlot,
  max: number,
): BundleChoice[] {
  return choicesThatFit(choices, (item) => bundleSetSlotFits(offer, slot, item)).slice(0, max);
}

/** "bag" for a group of one, "ball 2" for the second piece of a group of 2+ (lower case, for hints). */
function pieceNoun(slot: OfferBundleSlot, n: number): string {
  const name = slot.name.trim().toLowerCase();
  return slot.quantity > 1 ? `${name} ${n + 1}` : name;
}

/** "a bag", "an ear grip", "shorts" (a plural name takes no article; "glass" keeps one), "ball 2". */
function withArticle(slot: OfferBundleSlot, n: number): string {
  const noun = pieceNoun(slot, n);
  if (slot.quantity > 1 || /[^s]s$/i.test(noun)) return noun;
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** "Bag", "Ball 2". */
function pieceTitle(slot: OfferBundleSlot, n: number): string {
  const name = slot.name.trim();
  return slot.quantity > 1 ? `${name} ${n + 1}` : name;
}

/**
 * The numbered steps of the section, one per piece in group order (plus a size step once a
 * picked product has sizes). The product being viewed fills the first piece of its own group
 * (`ownText`, "This racket"; `ownDone` when its size and gifts above are chosen).
 */
export function bundleSaveSteps(
  bundle: ProductBundleSave,
  currentId: string,
  ownText: string,
  ownDone: boolean,
  choicesBySlot: readonly (readonly BundleChoice[])[],
  picks: BundlePicks,
): BundleSaveStep[] {
  const steps: BundleSaveStep[] = [];
  const own = ownPieceIndex(bundle);
  let number = 0;
  bundleSavePieces(bundle.slots).forEach((entry, piece) => {
    const slot = bundle.slots[entry.slot]!;
    number++;
    const title = `${number}. ${pieceTitle(slot, entry.n)}`;
    if (piece === own) {
      steps.push({
        kind: 'own',
        key: bundleSaveStepKey(piece),
        piece,
        title,
        text: ownText,
        done: ownDone,
        pickedId: currentId,
      });
      return;
    }
    const list = (choicesBySlot[entry.slot] ?? []).map((choice) => choice.view);
    const pick = picks[piece];
    const card = pick ? list.find((view) => view.productId === pick.productId) : undefined;
    steps.push({
      kind: 'piece',
      key: bundleSaveStepKey(piece),
      piece,
      title,
      choices: list,
      pickedId: card ? card.productId : null,
      message: `Choose ${withArticle(slot, entry.n)} first.`,
    });
    if (!card?.sizes) return;
    const sizeId = pick?.sizeId && card.sizes.some((size) => size.id === pick.sizeId) ? pick.sizeId : null;
    steps.push({
      kind: 'size',
      key: bundleSaveSizeStepKey(piece),
      piece,
      title: `${pieceTitle(slot, entry.n)} size`,
      sizes: card.sizes,
      pickedId: sizeId,
      chosen: card.sizes.find((size) => size.id === sizeId)?.label ?? null,
      message: `Choose a size for the ${pieceNoun(slot, entry.n)} first.`,
    });
  });
  return steps;
}

/** The first step still open, as the prompt Add Bundle to Bag shows; null when every piece is chosen. */
export function missingBundleSavePrompt(
  steps: readonly BundleSaveStep[],
  attempt: number,
): ChoicePrompt | null {
  const open = steps.find((step) => step.kind !== 'own' && step.pickedId === null);
  if (!open || open.kind === 'own') return null;
  return { key: open.key, message: open.message, attempt };
}

/** The header's saving: "Save EGP 300", "Save 15%", "Cheapest item free", "All for EGP 4,500". */
export function bundleSaveHeaderSaving(reward: OfferBundleSetReward, money: (egp: number) => string): string {
  switch (reward.type) {
    case 'amount':
      return `Save ${money(reward.amount)}`;
    case 'percent':
      return `Save ${reward.percent}%`;
    case 'cheapestFree':
      return 'Cheapest item free';
    case 'total':
      return `All for ${money(reward.price)}`;
  }
}
