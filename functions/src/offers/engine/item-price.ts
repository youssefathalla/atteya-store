import { formatAppliedOfferBadge, formatLabelOnlyOfferBadge } from './labels.js';
import { matchProduct, matchVariant } from './match.js';
import type {
  DisplayPriceResult,
  ItemPriceResult,
  Offer,
  OfferBadge,
  OfferTier,
  PricedProduct,
  PricingContext,
  VariantFacts,
} from './types.js';

export function liveOffers(offers: readonly Offer[], ctx: PricingContext): Offer[] {
  const nowMs = ctx.now.getTime();
  const normalizedCodes = new Set(
    (ctx.codes ?? []).map((code) => code.trim().toUpperCase()).filter((code) => code.length > 0),
  );

  return offers.filter((offer) => {
    if (!offer.active || offer.archived) return false;
    if (offer.schedule.startsAt && nowMs < offer.schedule.startsAt.getTime()) return false;
    if (offer.schedule.endsAt && nowMs >= offer.schedule.endsAt.getTime()) return false;
    if (offer.audience === 'signedIn' && !ctx.signedIn) return false;
    if (offer.requiresCode || offer.visibility === 'code') {
      const code = offer.code?.trim().toUpperCase();
      if (!code || !normalizedCodes.has(code)) return false;
    }
    return true;
  });
}

export function priceItem(
  product: PricedProduct,
  variant: VariantFacts | null,
  offers: readonly Offer[],
  ctx: PricingContext,
): ItemPriceResult {
  const basePrice = Math.max(0, Math.round(product.price));
  const listPrice =
    product.compareAtPrice !== null && product.compareAtPrice > basePrice
      ? Math.round(product.compareAtPrice)
      : basePrice;
  const alreadyOnSale = listPrice > basePrice;

  const active = liveOffers(offers, ctx);
  let bestPrice = basePrice;
  let winner: Offer | null = null;
  let winnerPartial = false;

  const labelBadges: OfferBadge[] = [];

  for (const offer of active) {
    const productMatch = matchProduct(offer.conditions, offer.exclude, product);
    if (productMatch === 'none') continue;

    if (variant !== null && !matchVariant(offer.conditions, offer.exclude, product, variant)) {
      continue;
    }

    const partial = variant === null && productMatch === 'partial';
    const candidatePrice = computeCandidateUnitPrice(offer, basePrice, listPrice, alreadyOnSale);

    if (candidatePrice !== null && candidatePrice < basePrice) {
      if (isBetterCandidate(candidatePrice, offer, bestPrice, winner)) {
        bestPrice = candidatePrice;
        winner = offer;
        winnerPartial = partial;
      }
    } else if (isLabelOnlyOffer(offer)) {
      const badge = formatLabelOnlyOfferBadge(offer, product, partial);
      if (badge) labelBadges.push(badge);
    }
  }

  const effectivePrice = bestPrice;
  const discountPercent =
    listPrice > 0 && effectivePrice < listPrice
      ? Math.round(((listPrice - effectivePrice) / listPrice) * 100)
      : 0;

  const badges: OfferBadge[] = [];
  if (winner) {
    badges.push(formatAppliedOfferBadge(winner, discountPercent, product, winnerPartial));
  } else if (alreadyOnSale && discountPercent > 0) {
    badges.push({
      offerId: 'sale',
      text: `${discountPercent}% off`,
      partial: false,
      labelOnly: false,
    });
  }

  for (const labelBadge of labelBadges) {
    if (badges.length >= 3) break;
    if (!badges.some((existing) => existing.text === labelBadge.text)) {
      badges.push(labelBadge);
    }
  }

  return {
    listPrice,
    basePrice,
    effectivePrice,
    appliedOfferId: winner?.id ?? null,
    discountPercent,
    badges,
  };
}

export function displayPrice(
  product: PricedProduct,
  offers: readonly Offer[],
  ctx: PricingContext,
): DisplayPriceResult {
  const active = liveOffers(offers, ctx);
  const synthesizedVariants = buildTestableVariants(product);

  const productLevel = priceItem(product, null, active, ctx);
  let fromPrice = productLevel.effectivePrice;
  let partial = false;

  if (synthesizedVariants.length > 1) {
    const variantPrices = synthesizedVariants.map(
      (variant) => priceItem(product, variant, active, ctx).effectivePrice,
    );
    fromPrice = Math.min(...variantPrices);
    const maxPrice = Math.max(...variantPrices);
    if (fromPrice !== maxPrice) {
      partial = true;
    }
  }

  const matchingOfferIds: string[] = [];
  for (const offer of active) {
    const level = matchProduct(offer.conditions, offer.exclude, product);
    if (level !== 'none') {
      if (level === 'partial') partial = true;
      if (
        productLevel.appliedOfferId === offer.id ||
        productLevel.badges.some((b) => b.offerId === offer.id)
      ) {
        matchingOfferIds.push(offer.id);
      }
    }
  }

  const listPrice = productLevel.listPrice;
  const maxDiscountPercent =
    listPrice > 0 && fromPrice < listPrice
      ? Math.round(((listPrice - fromPrice) / listPrice) * 100)
      : 0;

  return {
    fromPrice,
    listPrice,
    maxDiscountPercent,
    partial,
    badges: productLevel.badges.slice(0, 3),
    offerIds: Array.from(new Set(matchingOfferIds)),
  };
}

function computeCandidateUnitPrice(
  offer: Offer,
  basePrice: number,
  listPrice: number,
  alreadyOnSale: boolean,
): number | null {
  if (offer.scope !== 'item') return null;
  if (alreadyOnSale && offer.saleItems === 'exclude') return basePrice;

  const referencePrice =
    alreadyOnSale && offer.saleItems === 'bestOf' ? listPrice : basePrice;

  let rawDiscounted: number | null = null;
  const r = offer.reward;

  switch (r.kind) {
    case 'percentOff':
      rawDiscounted = roundEgp(referencePrice * (1 - r.percent / 100));
      break;
    case 'amountOff':
      rawDiscounted = Math.max(0, referencePrice - Math.round(r.amount));
      break;
    case 'fixedPrice': {
      const target = Math.max(0, Math.round(r.price));
      rawDiscounted = target < basePrice ? target : basePrice;
      break;
    }
    case 'tiered': {
      if (r.basis !== 'quantity') return null;
      const singleUnitTier = findSingleUnitTier(r.tiers);
      if (!singleUnitTier) return null;
      if (typeof singleUnitTier.percent === 'number') {
        rawDiscounted = roundEgp(referencePrice * (1 - singleUnitTier.percent / 100));
      } else if (typeof singleUnitTier.amount === 'number') {
        rawDiscounted = Math.max(0, referencePrice - Math.round(singleUnitTier.amount));
      }
      break;
    }
    case 'buyXGetY':
    case 'freeGift':
    case 'freeShipping':
      return null;
  }

  if (rawDiscounted === null) return null;
  return Math.min(basePrice, Math.max(0, rawDiscounted));
}

function findSingleUnitTier(tiers: readonly OfferTier[]): OfferTier | null {
  let matched: OfferTier | null = null;
  for (const tier of tiers) {
    if (tier.min <= 1) {
      if (!matched || tier.min >= matched.min) {
        matched = tier;
      }
    }
  }
  return matched;
}

function isLabelOnlyOffer(offer: Offer): boolean {
  if (offer.scope === 'cart') return true;
  const kind = offer.reward.kind;
  if (kind === 'buyXGetY' || kind === 'freeGift' || kind === 'freeShipping') return true;
  if (kind === 'tiered') return true;
  return false;
}

function isBetterCandidate(
  candidatePrice: number,
  candidateOffer: Offer,
  currentBestPrice: number,
  currentWinner: Offer | null,
): boolean {
  if (!currentWinner) return true;
  if (candidatePrice < currentBestPrice) return true;
  if (candidatePrice > currentBestPrice) return false;
  if (candidateOffer.priority !== currentWinner.priority) {
    return candidateOffer.priority > currentWinner.priority;
  }
  return (candidateOffer.updatedAtMs ?? 0) > (currentWinner.updatedAtMs ?? 0);
}

function buildTestableVariants(product: PricedProduct): VariantFacts[] {
  if (product.variants && product.variants.length > 0) {
    return [...product.variants];
  }
  const colors = product.colors.length > 0 ? product.colors : [null];
  const sizes = product.sizes.length > 0 ? product.sizes : [null];
  if (colors.length <= 1 && sizes.length <= 1) return [];

  const list: VariantFacts[] = [];
  for (const color of colors) {
    for (const size of sizes) {
      list.push({
        id: `${color ?? 'any'}-${size ?? 'any'}`,
        color,
        size,
      });
    }
  }
  return list;
}

function roundEgp(value: number): number {
  return Math.round(value);
}
