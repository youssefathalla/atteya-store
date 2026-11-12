// GENERATED — edit functions/src/offers/engine
import { splitBundleTotal } from './bundle-price';
import { matchProduct, matchVariant, type MatchLevel } from './match';
import type {
  Offer,
  OfferBundleSetReward,
  OfferBundleSlot,
  OfferConditions,
  OfferIssue,
  OfferReward,
  ProductFacts,
  VariantFacts,
} from './types';

/** A Bundle & Save offer has 2 to 4 groups. */
export const MIN_BUNDLE_SLOTS = 2;
export const MAX_BUNDLE_SLOTS = 4;
/** Each group asks for 1 to 5 pieces per set. */
export const MAX_BUNDLE_SLOT_PIECES = 5;
/** Longest group name ("T-shirt"). */
export const MAX_BUNDLE_SLOT_NAME = 40;
/** Highest percent off a set. */
export const MAX_BUNDLE_SET_PERCENT = 90;

type BundleSetReward = Extract<OfferReward, { kind: 'bundleSet' }>;

/**
 * Everything wrong with a Bundle & Save reward, as the offer editor shows it. Empty when the
 * reward can be priced. `validateOffer()` and the readers (`cleanBundleSet`) share these rules.
 */
export function bundleSetProblems(reward: BundleSetReward): OfferIssue[] {
  const problems: OfferIssue[] = [];
  const slots = reward.slots;
  if (slots.length < MIN_BUNDLE_SLOTS || slots.length > MAX_BUNDLE_SLOTS) {
    problems.push({
      code: 'reward.bundleSlots',
      message: `Add between ${MIN_BUNDLE_SLOTS} and ${MAX_BUNDLE_SLOTS} groups.`,
    });
  }
  const ids = new Set<string>();
  if (slots.some((slot) => !slot.id.trim() || ids.size === ids.add(slot.id).size)) {
    problems.push({
      code: 'reward.bundleSlotId',
      message: 'Each group needs its own id. Remove the group and add it again.',
    });
  }
  if (slots.some((slot) => !slot.name.trim() || slot.name.trim().length > MAX_BUNDLE_SLOT_NAME)) {
    problems.push({
      code: 'reward.bundleSlotName',
      message: `Give each group a short name between 1 and ${MAX_BUNDLE_SLOT_NAME} characters, e.g. "T-shirt".`,
    });
  }
  if (
    slots.some(
      (slot) =>
        !Number.isInteger(slot.quantity) || slot.quantity < 1 || slot.quantity > MAX_BUNDLE_SLOT_PIECES,
    )
  ) {
    problems.push({
      code: 'reward.bundleSlotPieces',
      message: `Each group needs between 1 and ${MAX_BUNDLE_SLOT_PIECES} pieces.`,
    });
  }
  if (slots.some((slot) => !slotPicksProducts(slot.conditions))) {
    problems.push({
      code: 'reward.bundleSlotProducts',
      message: 'Pick products, a category or a brand for every group.',
    });
  }
  const set = reward.setReward;
  switch (set.type) {
    case 'total':
      if (!wholeAboveZero(set.price)) {
        problems.push({
          code: 'reward.bundleSetPrice',
          message: 'Enter the set price in whole EGP, above 0.',
        });
      }
      break;
    case 'percent':
      if (!Number.isInteger(set.percent) || set.percent < 1 || set.percent > MAX_BUNDLE_SET_PERCENT) {
        problems.push({
          code: 'reward.bundleSetPercent',
          message: `Enter a discount between 1% and ${MAX_BUNDLE_SET_PERCENT}%.`,
        });
      }
      break;
    case 'amount':
      if (!wholeAboveZero(set.amount)) {
        problems.push({
          code: 'reward.bundleSetAmount',
          message: 'Enter the amount off the set in whole EGP, above 0.',
        });
      }
      break;
    case 'cheapestFree':
      break;
    default:
      problems.push({ code: 'reward.bundleSetType', message: 'Choose what shoppers save on each set.' });
  }
  if (reward.maxSets !== null && (!Number.isInteger(reward.maxSets) || reward.maxSets < 1)) {
    problems.push({
      code: 'reward.bundleMaxSets',
      message: 'Set "at most" to 1 set or more, or leave it empty for no limit.',
    });
  }
  return problems;
}

/**
 * The reward as the readers keep it: unchanged when it can be priced, otherwise with no groups,
 * so the offer prices nothing and no product counts toward it (the offer itself is kept).
 */
export function cleanBundleSet(reward: BundleSetReward): BundleSetReward {
  return bundleSetProblems(reward).length === 0 ? reward : { ...reward, slots: [] };
}

/** The groups of a Bundle & Save reward that can be priced; empty for a bad one or any other reward. */
export function bundleSetSlots(reward: OfferReward): readonly OfferBundleSlot[] {
  if (reward.kind !== 'bundleSet') return [];
  return bundleSetProblems(reward).length === 0 ? reward.slots : [];
}

/**
 * How a product fits a Bundle & Save offer: it matches the offer's own rules and at least one
 * group. `none` for any other offer kind's groups (there are none) or a bad reward.
 */
export function bundleSetMatch(
  offer: Pick<Offer, 'conditions' | 'exclude' | 'reward'>,
  product: ProductFacts,
): MatchLevel {
  const slots = bundleSetSlots(offer.reward);
  if (slots.length === 0) return 'none';
  const own = matchProduct(offer.conditions, offer.exclude, product);
  if (own === 'none') return 'none';
  let best: MatchLevel = 'none';
  for (const slot of slots) {
    const level = matchProduct(slot.conditions, offer.exclude, product);
    if (level === 'full') {
      best = 'full';
      break;
    }
    if (level === 'partial') best = 'partial';
  }
  if (best === 'none') return 'none';
  return own === 'full' && best === 'full' ? 'full' : 'partial';
}

/** True when this colour and size of the product fits at least one group of the offer. */
export function bundleSetVariantMatch(
  offer: Pick<Offer, 'conditions' | 'exclude' | 'reward'>,
  product: ProductFacts,
  variant: VariantFacts | null,
): boolean {
  if (!matchVariant(offer.conditions, offer.exclude, product, variant)) return false;
  return bundleSetSlots(offer.reward).some((slot) =>
    matchVariant(slot.conditions, offer.exclude, product, variant),
  );
}

/**
 * Whole EGP one complete set costs: `prices` are its pieces' own prices (before per-item offers).
 * A set price is what staff typed, percent and amount come off the pieces' total (never below 0),
 * and with the cheapest piece free the set costs the others.
 */
export function bundleSetTotal(reward: OfferBundleSetReward, prices: readonly number[]): number {
  const sum = prices.reduce((acc, price) => acc + price, 0);
  switch (reward.type) {
    case 'total':
      return Math.max(0, Math.round(reward.price));
    case 'percent':
      return Math.max(0, sum - Math.min(sum, Math.round((sum * reward.percent) / 100)));
    case 'amount':
      return Math.max(0, sum - Math.round(reward.amount));
    case 'cheapestFree':
      return prices.length === 0 ? 0 : sum - Math.min(...prices);
  }
}

/**
 * What each piece of a set pays, in whole EGP that add up to `bundleSetTotal()`: the set total
 * split by the pieces' own prices (`splitBundleTotal`), or with the cheapest piece free, that
 * piece 0 (the last one when several tie) and the others their own price.
 */
export function bundleSetShares(reward: OfferBundleSetReward, prices: readonly number[]): number[] {
  if (reward.type === 'cheapestFree') {
    const min = Math.min(...prices);
    const free = prices.lastIndexOf(min);
    return prices.map((price, index) => (index === free ? 0 : price));
  }
  return splitBundleTotal(bundleSetTotal(reward, prices), prices);
}

/** A group must name something: at least one product, category, brand or other value in each rule group. */
function slotPicksProducts(conditions: OfferConditions): boolean {
  return (
    conditions.anyOf.length > 0 &&
    conditions.anyOf.every((group) =>
      group.allOf.some((atom) => atom.field !== 'price' && (atom.in?.length ?? 0) > 0),
    )
  );
}

function wholeAboveZero(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}
