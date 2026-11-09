// Type-only imports: `npm run test:cart` loads this file straight from source.
import type { BagDealHint, Offer, OfferConditions } from './engine';

/**
 * True when Shop can list this offer's products (`/shop?offer=<id>`): the search index keeps the
 * offer ids of public offers for everyone that need no code, so only those can be filtered on.
 */
export function canShopOffer(offer: Offer): boolean {
  return offer.visibility === 'public' && offer.audience === 'everyone' && !offer.requiresCode;
}

/** Query params of the offer's Shop page. */
export function offerShopQuery(offerId: string): { readonly offer: string } {
  return { offer: offerId };
}

/**
 * The line under the offer's Shop heading: which piece is free in a Buy X Get Y offer whose free
 * pieces come from the same items ("The cheapest one is free."). Null for every other offer.
 */
export function offerShopSubtitle(offer: Offer): string | null {
  const reward = offer.reward;
  if (reward.kind !== 'buyXGetY' || reward.getConditions !== null) return null;
  const many = reward.get.quantity > 1;
  const subject = many ? 'The cheapest ones are' : 'The cheapest one is';
  return reward.get.percent >= 100 ? `${subject} free.` : `${subject} ${reward.get.percent}% off.`;
}

/**
 * How the shopper completes a Buy X Get Y group from the bag:
 * - `add-same`: the offer covers one product, so **Add 2** adds more of the same item.
 * - `shop`: the offer covers more (a category, a brand, a list, the whole store), so **Shop the
 *   Offer** opens Shop filtered to it.
 * - `browse`: the offer covers more but Shop can't filter on it (signed-in only or with a code,
 *   see `canShopOffer`), so **Keep Shopping** opens Shop.
 */
export function dealHintAction(offer: Offer | undefined): 'add-same' | 'shop' | 'browse' {
  if (!offer || coversOneProduct(offer)) return 'add-same';
  return canShopOffer(offer) ? 'shop' : 'browse';
}

/**
 * The bag's nudge text. One product: "Add 2 more to get 1 free". One category: "Add 2 more from
 * T-shirts & polos to get 1 free". The whole store: "Add any 2 more items to get 1 free".
 * Anything else: "Add 2 more items to get 1 free". `categoryName` turns a category id into its
 * name; without one (or for an unknown id) the text says "items".
 */
export function dealHintText(
  hint: BagDealHint,
  offer?: Offer,
  categoryName: (id: string) => string | null = () => null,
): string {
  if (!hint.samePool) return `${hint.title}: add the free item to your bag.`;
  const reward = hint.percent >= 100 ? `${hint.free} free` : `${hint.free} at ${hint.percent}% off`;
  const items = hint.missing === 1 ? 'item' : 'items';
  if (dealHintAction(offer) === 'add-same') return `Add ${hint.missing} more to get ${reward}`;
  if (offer!.conditions.anyOf.length === 0) return `Add any ${hint.missing} more ${items} to get ${reward}`;
  const category = oneCategoryId(offer!);
  const name = category ? categoryName(category) : null;
  if (name) return `Add ${hint.missing} more from ${name} to get ${reward}`;
  return `Add ${hint.missing} more ${items} to get ${reward}`;
}

type ConditionAtom = OfferConditions['anyOf'][number]['allOf'][number];

/** The offer's conditions name exactly one product and nothing else. */
function coversOneProduct(offer: Offer): boolean {
  const atom = onlyAtom(offer);
  return (
    atom !== null &&
    atom.field === 'productId' &&
    (atom.in?.length ?? 0) === 1 &&
    (atom.notIn?.length ?? 0) === 0
  );
}

/** The one category the offer covers, when its conditions are only that. */
function oneCategoryId(offer: Offer): string | null {
  const atom = onlyAtom(offer);
  if (atom === null || atom.field !== 'categoryIds' || (atom.notIn?.length ?? 0) > 0) return null;
  return atom.in?.length === 1 ? (atom.in[0] ?? null) : null;
}

function onlyAtom(offer: Offer): ConditionAtom | null {
  const groups = offer.conditions.anyOf;
  if (groups.length !== 1 || groups[0]!.allOf.length !== 1) return null;
  return groups[0]!.allOf[0]!;
}
