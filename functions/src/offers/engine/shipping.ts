import { liveOffers } from './item-price.js';
import { matchProduct } from './match.js';
import type { Offer, PricedProduct, PricingContext } from './types.js';

export interface ShippingZone {
  readonly id: string;
  readonly name: string;
  readonly fee: number;
  readonly governorates: readonly string[];
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
  readonly baseFee: number;
  readonly zones: readonly ShippingZone[];
  readonly freeOver: { readonly active: boolean; readonly threshold: number | null };
  readonly promo: ShippingPromo;
  readonly note: string;
}

export type ShippingReason = 'zone' | 'base' | 'promo' | 'freeOver' | 'offer';

export interface ShippingQuote {
  readonly fee: number;
  readonly baseFee: number;
  readonly reason: ShippingReason;
  readonly offerId?: string;
}

export interface ShippingQuoteInput {
  readonly governorateId: string | null;
  readonly goodsSubtotal: number;
  readonly lines?: readonly PricedProduct[];
}

const TIE_ORDER: readonly ShippingReason[] = ['promo', 'freeOver', 'offer', 'zone', 'base'];

export function shippingQuote(
  settings: ShippingSettings,
  input: ShippingQuoteInput,
  offers: readonly Offer[],
  ctx: PricingContext,
): ShippingQuote {
  const zone = input.governorateId
    ? settings.zones.find((z) => z.governorates.includes(input.governorateId as string))
    : undefined;
  const startFee = zone ? zone.fee : settings.baseFee;
  const candidates: { fee: number; reason: ShippingReason; offerId?: string }[] = [
    { fee: startFee, reason: zone ? 'zone' : 'base' },
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
    baseFee: settings.baseFee,
    reason: winner.reason,
    ...(winner.offerId ? { offerId: winner.offerId } : {}),
  };
}

export function shippingFromFee(settings: ShippingSettings): number {
  return Math.min(settings.baseFee, ...settings.zones.map((zone) => zone.fee));
}
