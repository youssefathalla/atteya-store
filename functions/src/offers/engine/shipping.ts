import { liveOffers } from './item-price.js';
import { matchProduct } from './match.js';
import type { Offer, PricedProduct, PricingContext } from './types.js';

/** Fixed catalogue of three parcel sizes per region. */
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

export interface ShippingQuoteInput {
  readonly region: ShippingRegion;
  /** When null/undefined, auto-pick the smallest fitting box. */
  readonly boxId?: ShippingBoxId | null;
  readonly totalWeightGrams: number;
  readonly goodsSubtotal: number;
  readonly lines?: readonly PricedProduct[];
}

export type SelectShippingBoxResult =
  | { readonly ok: true; readonly box: ShippingBox; readonly auto: boolean }
  | {
      readonly ok: false;
      readonly code: 'too-heavy' | 'unknown-box' | 'box-too-small' | 'no-boxes';
    };

const TIE_ORDER: readonly ShippingReason[] = ['promo', 'freeOver', 'offer', 'box'];

export function boxesForRegion(
  settings: ShippingSettings,
  region: ShippingRegion,
): readonly ShippingBox[] {
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
 * Box customers never choose. Smallest box that holds `totalWeightGrams`,
 * or the largest box when any item has no weight. Known weight that already
 * exceeds every box is still too heavy. Never reads a client box id.
 */
export function assignShippingBox(
  boxes: readonly ShippingBox[],
  totalWeightGrams: number,
  anyWeightMissing: boolean,
): AssignShippingBoxResult {
  if (boxes.length === 0) return { ok: false, code: 'no-boxes' };
  const largestCapacity = boxes.reduce((max, box) => Math.max(max, box.maxWeightGrams), 0);
  const known = Math.max(0, Math.round(totalWeightGrams));
  if (anyWeightMissing && known > largestCapacity) {
    return { ok: false, code: 'too-heavy' };
  }
  const selected = selectShippingBox(
    boxes,
    anyWeightMissing ? largestCapacity : totalWeightGrams,
    null,
  );
  if (selected.ok) return { ok: true, box: selected.box, auto: true };
  if (selected.code === 'too-heavy') return { ok: false, code: 'too-heavy' };
  return { ok: false, code: 'no-boxes' };
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

  for (const offer of liveOffers(offers, ctx)) {
    if (offer.reward.kind !== 'freeShipping') continue;
    if (offer.minimum?.subtotal !== undefined && input.goodsSubtotal < offer.minimum.subtotal) {
      continue;
    }
    const lines = input.lines ?? [];
    const qualifies =
      offer.conditions.anyOf.length === 0 ||
      lines.some((line) => matchProduct(offer.conditions, offer.exclude, line) !== 'none');
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
