// Type-only imports: `npm run test:cart` loads this file straight from source.
import type { GiftChoiceView } from '@core/services/cart/cart-gifts';
import type { Offer, OfferBundleSlot } from '@core/services/offers/engine';

/**
 * Pure rules of the Bundle & Save page (`/bundle/<offer id>`, ATS-279): whether the bundle can be
 * bought now, which pieces start picked, what the one button asks for next, and the header's
 * countdown and start date.
 */

/** Whether the bundle can be bought now, and if not, why. */
export type BundlePageState = 'open' | 'ended' | 'upcoming' | 'members' | 'unavailable';

/**
 * `ended`: paused, archived or past its end; `upcoming`: not started yet; `unavailable`: needs a
 * code or has no groups; `members`: for signed-in shoppers (with a confirmed email) only, or once
 * per customer, and this shopper isn't one; `open`: it can be bought.
 */
export function bundlePageState(
  offer: Offer,
  nowMs: number,
  signedIn: boolean,
  /** The offer's usable groups (`bundleSetSlots()`: none when the reward is malformed). */
  slotCount: number,
): BundlePageState {
  if (!offer.active || offer.archived) return 'ended';
  const { startsAt, endsAt } = offer.schedule;
  if (endsAt && nowMs >= endsAt.getTime()) return 'ended';
  if (startsAt && nowMs < startsAt.getTime()) return 'upcoming';
  if (offer.requiresCode || offer.visibility === 'code') return 'unavailable';
  if (offer.reward.kind !== 'bundleSet' || slotCount < 2) return 'unavailable';
  if ((offer.audience === 'signedIn' || offer.limits.perCustomer !== null) && !signedIn) return 'members';
  return 'open';
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The header's countdown: "Ends in 2d 14h", "Ends in 5h 12m", "Ends in 12m"; null without an end or once ended. */
export function bundleEndsIn(endsAtMs: number | null, nowMs: number): string | null {
  if (endsAtMs === null) return null;
  const left = endsAtMs - nowMs;
  if (left <= 0) return null;
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / HOUR_MS);
  const minutes = Math.max(1, Math.floor((left % HOUR_MS) / 60_000));
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  if (hours > 0) return `Ends in ${hours}h ${minutes}m`;
  return `Ends in ${minutes}m`;
}

/** "Starts on 20 Nov." in Cairo time (the offers' own time zone). */
export function bundleStartsOn(startsAt: Date): string {
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Cairo',
  }).format(startsAt);
  return `Starts on ${day}.`;
}

/** One picked piece of a group: the product, and its size once chosen (null when it has none). */
export interface BundlePiecePick {
  readonly productId: string;
  readonly sizeId: string | null;
  /** Already in the bag (`?from=bag`): it counts toward the bundle but Add Bundle to Bag doesn't add it again. */
  readonly inBag?: true;
}

/** Picks per group, in the offer's group order. */
export type BundleGroupPicks = readonly (readonly BundlePiecePick[])[];

/** What the page knows about one group: its name, how many pieces, and the products that fit it. */
export interface BundleGroupFacts {
  readonly name: string;
  readonly quantity: number;
  readonly choices: readonly GiftChoiceView[];
}

/** The facts of each group, from the offer's groups and the products read for each. */
export function bundleGroupFacts(
  slots: readonly OfferBundleSlot[],
  choices: readonly (readonly GiftChoiceView[])[],
): BundleGroupFacts[] {
  return slots.map((slot, index) => ({
    name: slot.name.trim(),
    quantity: Math.max(1, slot.quantity),
    choices: choices[index] ?? [],
  }));
}

function choiceOf(group: BundleGroupFacts, productId: string): GiftChoiceView | undefined {
  return group.choices.find((choice) => choice.productId === productId);
}

/** True when this pick still names a product of the group and, when it has sizes, one of them. */
export function pickComplete(group: BundleGroupFacts, pick: BundlePiecePick): boolean {
  const choice = choiceOf(group, pick.productId);
  if (!choice) return false;
  return !choice.sizes || choice.sizes.some((size) => size.id === pick.sizeId);
}

/** Pieces of the group whose product is picked (sizes may still be open). */
export function piecesChosen(group: BundleGroupFacts, picks: readonly BundlePiecePick[]): number {
  return Math.min(group.quantity, picks.filter((pick) => !!choiceOf(group, pick.productId)).length);
}

/** Every piece of the group has its product and, when it has sizes, its size. */
export function groupComplete(group: BundleGroupFacts, picks: readonly BundlePiecePick[]): boolean {
  return picks.length === group.quantity && picks.every((pick) => pickComplete(group, pick));
}

/** The size a product starts on: its only size, else none. */
function startSize(choice: GiftChoiceView | undefined): string | null {
  return choice?.sizes?.length === 1 ? choice.sizes[0]!.id : null;
}

/** A group with exactly one product to choose: it is in the bundle from the start. */
export function groupFixed(group: BundleGroupFacts): boolean {
  return group.choices.length === 1;
}

/**
 * The picks the page starts with. Groups with one product start with it (every piece). Then the
 * product the shopper came from (`?product=`) goes into the first group it fits, and the bag's
 * lines (`?from=bag`, one entry per piece left outside a finished set) fill the groups they fit,
 * each only up to its pieces, marked `inBag` so they aren't added twice (in a one-product group
 * a bag piece takes the place of one of its starting pieces).
 * Groups with several products otherwise start unpicked.
 */
export function startingPicks(
  groups: readonly BundleGroupFacts[],
  productId: string | null,
  bagPieces: readonly BundlePiecePick[],
): BundlePiecePick[][] {
  const picks: BundlePiecePick[][] = groups.map((group) =>
    groupFixed(group)
      ? Array.from({ length: group.quantity }, () => ({
          productId: group.choices[0]!.productId,
          sizeId: startSize(group.choices[0]),
        }))
      : [],
  );
  const place = (pick: BundlePiecePick, needSize: boolean, inBag: boolean): boolean => {
    const at = groups.findIndex((group, index) => {
      const choice = choiceOf(group, pick.productId);
      if (!choice) return false;
      if (needSize && choice.sizes && !choice.sizes.some((size) => size.id === pick.sizeId)) return false;
      // A fixed group already holds its product: a bag piece of it takes one of its unmarked pieces.
      if (groupFixed(group)) return inBag && picks[index]!.some((entry) => !entry.inBag);
      return picks[index]!.length < group.quantity;
    });
    if (at < 0) return false;
    const choice = choiceOf(groups[at]!, pick.productId);
    const sizeId = choice?.sizes?.some((size) => size.id === pick.sizeId) ? pick.sizeId : startSize(choice);
    const placed: BundlePiecePick = inBag
      ? { productId: pick.productId, sizeId, inBag: true }
      : { productId: pick.productId, sizeId };
    if (groupFixed(groups[at]!)) {
      const slot = picks[at]!.findIndex((entry) => !entry.inBag);
      picks[at]![slot] = placed;
    } else {
      picks[at]!.push(placed);
    }
    return true;
  };
  if (productId) place({ productId, sizeId: null }, false, false);
  for (const piece of bagPieces) place(piece, true, true);
  return picks;
}

/** Index of the group the shopper is on: the first not complete, else the last. */
export function firstOpenGroup(groups: readonly BundleGroupFacts[], picks: BundleGroupPicks): number {
  const open = groups.findIndex((group, index) => !groupComplete(group, picks[index] ?? []));
  return open >= 0 ? open : Math.max(0, groups.length - 1);
}

/** "a Grip", "an Ear Grip", "Socks" (a plural name takes no article; "Glass" keeps one). */
function withArticle(name: string): string {
  if (/[^s]s$/i.test(name)) return name;
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** What the one button does next. */
export type BundleNextAction =
  | { readonly kind: 'product' | 'size'; readonly group: number; readonly label: string }
  | { readonly kind: 'add'; readonly label: 'Add Bundle to Bag' };

/**
 * The button names the next thing to do: "Choose a Grip" while a group still misses a product
 * ("Choose 2 × Ball" for the pieces a group of 2+ still misses), "Choose a Socks Size" while a picked product misses
 * its size, then "Add Bundle to Bag".
 */
export function nextBundleAction(
  groups: readonly BundleGroupFacts[],
  picks: BundleGroupPicks,
): BundleNextAction {
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    const groupPicks = picks[index] ?? [];
    if (piecesChosen(group, groupPicks) < group.quantity) {
      const left = group.quantity - piecesChosen(group, groupPicks);
      const label =
        group.quantity > 1 ? `Choose ${left} × ${group.name}` : `Choose ${withArticle(group.name)}`;
      return { kind: 'product', group: index, label };
    }
    if (!groupComplete(group, groupPicks)) {
      return {
        kind: 'size',
        group: index,
        label: `Choose ${/^[aeiou]/i.test(group.name) ? 'an' : 'a'} ${group.name} Size`,
      };
    }
  }
  return { kind: 'add', label: 'Add Bundle to Bag' };
}

/**
 * The group's picks after the shopper taps a product's card: a group of one piece takes that
 * product (tapping it again keeps it); a group of 2+ adds one piece of it while there is room.
 */
export function pickProduct(
  group: BundleGroupFacts,
  picks: readonly BundlePiecePick[],
  productId: string,
): BundlePiecePick[] {
  const choice = choiceOf(group, productId);
  if (!choice) return [...picks];
  if (group.quantity === 1) {
    if (picks[0]?.productId === productId) return [...picks];
    return [{ productId, sizeId: startSize(choice) }];
  }
  if (picks.length >= group.quantity) return [...picks];
  return [...picks, { productId, sizeId: startSize(choice) }];
}

/** The group's picks after − on a product's card: its last piece goes. */
export function removeProductPiece(picks: readonly BundlePiecePick[], productId: string): BundlePiecePick[] {
  const at = picks.map((pick) => pick.productId).lastIndexOf(productId);
  if (at < 0) return [...picks];
  return picks.filter((_, index) => index !== at);
}

/** The group's picks after a size is chosen for one piece. */
export function pickSize(
  picks: readonly BundlePiecePick[],
  piece: number,
  sizeId: string,
): BundlePiecePick[] {
  return picks.map((pick, index) => {
    if (index !== piece || pick.sizeId === sizeId) return pick;
    // Another size is another item: a piece taken from the bag is then added as a new one.
    return { productId: pick.productId, sizeId };
  });
}

/** "Balls · choose 3" hint: "3 of 3 chosen". */
export function chosenCountText(group: BundleGroupFacts, picks: readonly BundlePiecePick[]): string {
  return `${piecesChosen(group, picks)} of ${group.quantity} chosen`;
}

/** "All socks in this bundle are sold out right now." */
export function soldOutText(groupName: string): string {
  return `All ${groupName.toLowerCase()} in this bundle are sold out right now.`;
}
