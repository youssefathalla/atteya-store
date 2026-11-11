import { liveOffers } from './item-price.js';
import { matchVariant } from './match.js';
import type { Offer, PricedProduct, PricingContext, VariantFacts } from './types.js';

/** Up to three parcel sizes per region (a region may use fewer, e.g. Egypt uses box1 and box2). */
export type ShippingBoxId = 'box1' | 'box2' | 'box3';

export const SHIPPING_BOX_IDS: readonly ShippingBoxId[] = ['box1', 'box2', 'box3'];

export interface ShippingBox {
  readonly id: ShippingBoxId;
  readonly name: string;
  /** Inclusive max packed weight for this box. */
  readonly maxWeightGrams: number;
  readonly maxLengthCm: number;
  readonly maxWidthCm: number;
  readonly maxHeightCm: number;
  /** Whole EGP fee for this box. */
  readonly feeEgp: number;
}

export interface ShippingPromo {
  readonly active: boolean;
  readonly fee: number;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly minSubtotal: number | null;
  readonly banner: string | null;
}

export interface ShippingSettings {
  readonly currency: 'EGP';
  readonly egyptBoxes: readonly ShippingBox[];
  readonly internationalBoxes: readonly ShippingBox[];
  readonly freeOver: { readonly active: boolean; readonly threshold: number | null };
  readonly promo: ShippingPromo;
  readonly note: string;
}

export type ShippingRegion = 'egypt' | 'international';

export type ShippingReason = 'box' | 'promo' | 'freeOver' | 'offer';

export interface ShippingQuote {
  readonly fee: number;
  readonly boxId: ShippingBoxId;
  readonly box: ShippingBox;
  readonly reason: ShippingReason;
  readonly offerId?: string;
}

/** One paid bag line for a Free shipping offer: the product and the size and colour chosen. */
export interface ShippingQuoteLine {
  readonly product: PricedProduct;
  /** The chosen size and colour (null when the product has no choice or none matched). */
  readonly variant: VariantFacts | null;
}

export interface ShippingQuoteInput {
  readonly region: ShippingRegion;
  /** When null/undefined, auto-pick the smallest fitting box. */
  readonly boxId?: ShippingBoxId | null;
  readonly totalWeightGrams: number;
  readonly goodsSubtotal: number;
  readonly lines?: readonly ShippingQuoteLine[];
}

export type SelectShippingBoxResult =
  | { readonly ok: true; readonly box: ShippingBox; readonly auto: boolean }
  | {
      readonly ok: false;
      readonly code: 'too-heavy' | 'unknown-box' | 'box-too-small' | 'no-boxes';
    };

const TIE_ORDER: readonly ShippingReason[] = ['promo', 'freeOver', 'offer', 'box'];

export function boxesForRegion(settings: ShippingSettings, region: ShippingRegion): readonly ShippingBox[] {
  return region === 'egypt' ? settings.egyptBoxes : settings.internationalBoxes;
}

/** Sort ascending by capacity so the first fit is the smallest box. */
export function sortedBoxes(boxes: readonly ShippingBox[]): ShippingBox[] {
  return [...boxes].sort((a, b) => a.maxWeightGrams - b.maxWeightGrams || a.feeEgp - b.feeEgp);
}

/**
 * Pick a box by packed weight. Dimensions are capacity metadata for admin /
 * future product packing — fit today is weight-only (products lack dims).
 */
export function selectShippingBox(
  boxes: readonly ShippingBox[],
  totalWeightGrams: number,
  preferredBoxId?: ShippingBoxId | null,
): SelectShippingBoxResult {
  if (boxes.length === 0) return { ok: false, code: 'no-boxes' };
  const ordered = sortedBoxes(boxes);
  const weight = Math.max(0, Math.round(totalWeightGrams));

  if (preferredBoxId) {
    const chosen = ordered.find((box) => box.id === preferredBoxId);
    if (!chosen) return { ok: false, code: 'unknown-box' };
    if (weight > chosen.maxWeightGrams) return { ok: false, code: 'box-too-small' };
    return { ok: true, box: chosen, auto: false };
  }

  const fit = ordered.find((box) => weight <= box.maxWeightGrams);
  if (!fit) return { ok: false, code: 'too-heavy' };
  return { ok: true, box: fit, auto: true };
}

/** Failures checkout can still hit. A preferred box is never supplied. */
export type AssignShippingBoxResult =
  | { readonly ok: true; readonly box: ShippingBox; readonly auto: true }
  | { readonly ok: false; readonly code: 'too-heavy' | 'no-boxes' };

/**
 * Box customers never choose: the smallest box that holds `totalWeightGrams`
 * (a `parcelWeight()` total, so products without a weight are already counted).
 * Never reads a client box id.
 */
export function assignShippingBox(
  boxes: readonly ShippingBox[],
  totalWeightGrams: number,
): AssignShippingBoxResult {
  if (boxes.length === 0) return { ok: false, code: 'no-boxes' };
  const selected = selectShippingBox(boxes, totalWeightGrams, null);
  if (selected.ok) return { ok: true, box: selected.box, auto: true };
  if (selected.code === 'too-heavy') return { ok: false, code: 'too-heavy' };
  return { ok: false, code: 'no-boxes' };
}

/**
 * Weight counted for each unit of a product that has no weight yet. A last resort: every
 * category has a default (`DEFAULT_WEIGHT_GRAMS_BY_CATEGORY`), so this only applies to a product
 * in a category with none. 500 g sits in the middle of the catalogue's range, so a single such
 * item still fits the smallest Egypt box and the normal weight rule applies.
 */
export const ASSUMED_WEIGHT_GRAMS = 500;

/** One bag line for weighing: the product's weight (null = not set) and how many. */
export interface ParcelLine {
  readonly weightGrams: number | null;
  readonly quantity: number;
}

export interface ParcelWeight {
  /**
   * Packed weight: the known weights plus `ASSUMED_WEIGHT_GRAMS` per unit without a weight.
   * 0 g is a known weight (socks never add to the parcel).
   */
  readonly totalWeightGrams: number;
  /** True when any product had no weight and was counted as `ASSUMED_WEIGHT_GRAMS`. */
  readonly anyWeightMissing: boolean;
}

/** Total packed weight of a bag. A weight of 0 is real; a missing weight counts as 500 g. */
export function parcelWeight(lines: readonly ParcelLine[]): ParcelWeight {
  let totalWeightGrams = 0;
  let anyWeightMissing = false;
  for (const line of lines) {
    const weight = line.weightGrams;
    const quantity = Math.max(0, line.quantity);
    if (typeof weight === 'number' && Number.isFinite(weight) && weight >= 0) {
      totalWeightGrams += Math.round(weight) * quantity;
    } else {
      anyWeightMissing = true;
      totalWeightGrams += ASSUMED_WEIGHT_GRAMS * quantity;
    }
  }
  return { totalWeightGrams, anyWeightMissing };
}

/**
 * How a bag is delivered:
 * - `box`: the assigned box. `quoteWeightGrams` is the parcel weight to pass to `shippingQuote`.
 * - `to-be-agreed`: Egypt only. Heavier than the largest Egypt box, so staff agree the
 *   delivery fee with the shopper on WhatsApp after the order is placed.
 * - `too-heavy`: abroad, heavier than the largest box. Cannot be ordered.
 * - `unavailable`: no boxes are set up.
 */
export type DeliveryPlan =
  | { readonly kind: 'box'; readonly box: ShippingBox; readonly quoteWeightGrams: number }
  | { readonly kind: 'to-be-agreed' }
  | { readonly kind: 'too-heavy' }
  | { readonly kind: 'unavailable' };

export function planDelivery(
  boxes: readonly ShippingBox[],
  region: ShippingRegion,
  weight: ParcelWeight,
): DeliveryPlan {
  const selection = assignShippingBox(boxes, weight.totalWeightGrams);
  if (selection.ok) {
    return { kind: 'box', box: selection.box, quoteWeightGrams: weight.totalWeightGrams };
  }
  if (selection.code === 'too-heavy') {
    return region === 'egypt' ? { kind: 'to-be-agreed' } : { kind: 'too-heavy' };
  }
  return { kind: 'unavailable' };
}

export function shippingQuote(
  settings: ShippingSettings,
  input: ShippingQuoteInput,
  offers: readonly Offer[],
  ctx: PricingContext,
): ShippingQuote {
  const boxes = boxesForRegion(settings, input.region);
  const selected = selectShippingBox(boxes, input.totalWeightGrams, input.boxId);
  if (!selected.ok) {
    throw new Error(`shippingQuote: cannot select box (${selected.code})`);
  }

  const candidates: { fee: number; reason: ShippingReason; offerId?: string }[] = [
    { fee: selected.box.feeEgp, reason: 'box' },
  ];

  const nowMs = ctx.now.getTime();
  const promo = settings.promo;
  if (
    promo.active &&
    (!promo.startsAt || nowMs >= promo.startsAt.getTime()) &&
    (!promo.endsAt || nowMs < promo.endsAt.getTime()) &&
    input.goodsSubtotal >= (promo.minSubtotal ?? 0)
  ) {
    candidates.push({ fee: promo.fee, reason: 'promo' });
  }

  if (
    settings.freeOver.active &&
    settings.freeOver.threshold !== null &&
    input.goodsSubtotal >= settings.freeOver.threshold
  ) {
    candidates.push({ fee: 0, reason: 'freeOver' });
  }

  // Free shipping offers are campaigns for Egypt orders only: shipping abroad costs far more,
  // so an order shipped outside Egypt always pays its box fee (or the settings rules above).
  const offersForRegion = input.region === 'egypt' ? liveOffers(offers, ctx) : [];
  for (const offer of offersForRegion) {
    if (offer.reward.kind !== 'freeShipping') continue;
    if (offer.minimum?.subtotal !== undefined && input.goodsSubtotal < offer.minimum.subtotal) {
      continue;
    }
    // With lines, every line goes through `matchVariant` with its chosen size and colour, so
    // Except rules always apply (an "all except Brand X" offer never frees a bag of only Brand X,
    // and "all except Black" never frees a bag of only a multi-colour product in Black), the same
    // way item prices, Buy X Get Y and gifts match. Without lines, only an offer with no product
    // rules and no Except rules can qualify.
    const qualifies = input.lines
      ? input.lines.some((line) => matchVariant(offer.conditions, offer.exclude, line.product, line.variant))
      : offer.conditions.anyOf.length === 0 && offer.exclude.anyOf.length === 0;
    if (qualifies) candidates.push({ fee: 0, reason: 'offer', offerId: offer.id });
  }

  const lowest = Math.max(0, Math.min(...candidates.map((c) => Math.round(c.fee))));
  const winners = candidates.filter((c) => Math.max(0, Math.round(c.fee)) === lowest);
  winners.sort((a, b) => TIE_ORDER.indexOf(a.reason) - TIE_ORDER.indexOf(b.reason));
  const winner = winners[0];

  return {
    fee: lowest,
    boxId: selected.box.id,
    box: selected.box,
    reason: winner.reason,
    ...(winner.offerId ? { offerId: winner.offerId } : {}),
  };
}

/** Lowest Egypt box fee for storefront “from” copy. */
export function shippingFromFee(settings: ShippingSettings): number {
  const fees = settings.egyptBoxes.map((box) => box.feeEgp);
  if (fees.length === 0) return 0;
  return Math.min(...fees);
}
