import { liveOffers } from './item-price.js';
import { matchProduct, matchVariant } from './match.js';
import type {
  Offer,
  OfferGift,
  PricingContext,
  ProductFacts,
  VariantFacts,
} from './types.js';

/** Most gifts in one Free gift offer (e.g. a shirt and socks). */
export const MAX_OFFER_GIFTS = 5;
/** Most products a shopper can choose from for one gift. */
export const MAX_GIFT_CHOICES = 20;
/** Longest gift name ("Free shirt"). */
export const MAX_GIFT_NAME = 40;

/** What the engine needs to know about one gift choice right now. */
export interface GiftChoiceFacts {
  readonly productId: string;
  readonly published: boolean;
  readonly inStock: boolean;
}

/** The live Free gift offer for one product, with only the choices that can be given now. */
export interface ProductGiftOffer {
  readonly offerId: string;
  readonly title: string;
  /** Gifts with at least one published, in-stock choice; gifts with none are left out. */
  readonly gifts: readonly OfferGift[];
}

/** One gift the shopper picked for a bag line. */
export interface GiftPick {
  readonly giftId: string;
  readonly productId: string;
}

export type GiftPickProblem = 'unknown-gift' | 'duplicate-gift' | 'choice-not-allowed';

export type GiftPickCheck =
  | { readonly ok: true; readonly picks: readonly { readonly gift: OfferGift; readonly productId: string }[] }
  | { readonly ok: false; readonly problem: GiftPickProblem };

/**
 * The Free gift offer a product (or one of its variants) gets now, or null.
 * When several match, the highest priority wins, then the newest edit, then the id.
 * An offer whose gifts are all sold out is skipped, so the next one can apply.
 */
export function giftOfferForProduct(
  product: ProductFacts,
  variant: VariantFacts | null,
  offers: readonly Offer[],
  ctx: PricingContext,
  choices: readonly GiftChoiceFacts[],
): ProductGiftOffer | null {
  const candidates = liveOffers(offers, ctx)
    .filter((offer) => offerGivesGiftsTo(offer, product, variant))
    .sort(compareGiftOffers);
  for (const offer of candidates) {
    const result = availableGiftOffer(offer, choices);
    if (result) return result;
  }
  return null;
}

/**
 * The given offer as a gift offer for this product, or null when it is not live, not a Free gift
 * offer, the product doesn't qualify, or none of its gifts can be given now.
 * Checkout uses this to re-check the offer a bag line names.
 */
export function giftOfferById(
  offerId: string,
  product: ProductFacts,
  variant: VariantFacts | null,
  offers: readonly Offer[],
  ctx: PricingContext,
  choices: readonly GiftChoiceFacts[],
): ProductGiftOffer | null {
  const offer = liveOffers(offers, ctx).find((entry) => entry.id === offerId);
  if (!offer || !offerGivesGiftsTo(offer, product, variant)) return null;
  return availableGiftOffer(offer, choices);
}

/**
 * Checks the shopper's picks against a gift offer: each pick names one of the offer's gifts at
 * most once, and a product that gift allows now. A gift the shopper didn't pick is simply not
 * given. Picks come back in the offer's gift order.
 */
export function checkGiftPicks(giftOffer: ProductGiftOffer, picks: readonly GiftPick[]): GiftPickCheck {
  const seen = new Set<string>();
  const byGift = new Map<string, string>();
  for (const pick of picks) {
    if (seen.has(pick.giftId)) return { ok: false, problem: 'duplicate-gift' };
    seen.add(pick.giftId);
    const gift = giftOffer.gifts.find((entry) => entry.id === pick.giftId);
    if (!gift) return { ok: false, problem: 'unknown-gift' };
    if (!gift.productIds.includes(pick.productId)) return { ok: false, problem: 'choice-not-allowed' };
    byGift.set(gift.id, pick.productId);
  }
  const resolved: { gift: OfferGift; productId: string }[] = [];
  for (const gift of giftOffer.gifts) {
    const productId = byGift.get(gift.id);
    if (productId) resolved.push({ gift, productId });
  }
  return { ok: true, picks: resolved };
}

/** Every product id a Free gift offer can give, for loading their stock in one go. */
export function giftChoiceIds(offers: readonly Offer[]): string[] {
  const ids = new Set<string>();
  for (const offer of offers) {
    if (offer.reward.kind !== 'freeGift') continue;
    for (const gift of offer.reward.gifts) {
      for (const id of gift.productIds) ids.add(id);
    }
  }
  return Array.from(ids);
}

function offerGivesGiftsTo(offer: Offer, product: ProductFacts, variant: VariantFacts | null): boolean {
  if (offer.reward.kind !== 'freeGift') return false;
  if (matchProduct(offer.conditions, offer.exclude, product) === 'none') return false;
  return variant === null || matchVariant(offer.conditions, offer.exclude, product, variant);
}

function availableGiftOffer(offer: Offer, choices: readonly GiftChoiceFacts[]): ProductGiftOffer | null {
  if (offer.reward.kind !== 'freeGift') return null;
  const available = new Set(
    choices.filter((choice) => choice.published && choice.inStock).map((choice) => choice.productId),
  );
  const gifts: OfferGift[] = [];
  for (const gift of offer.reward.gifts) {
    const productIds = gift.productIds.filter((id) => available.has(id));
    if (productIds.length > 0) gifts.push({ ...gift, productIds });
  }
  if (gifts.length === 0) return null;
  return { offerId: offer.id, title: offer.title, gifts };
}

function compareGiftOffers(a: Offer, b: Offer): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aMs = a.updatedAtMs ?? 0;
  const bMs = b.updatedAtMs ?? 0;
  if (aMs !== bMs) return bMs - aMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
