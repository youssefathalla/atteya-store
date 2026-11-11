import { bundleRows, bundleRowsText } from './bundle-price.js';
import { partialColorSummary } from './match.js';
import type { Offer, OfferBadge, OfferDraft, OfferTier, ProductFacts } from './types.js';

const COLOR_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  white: 'White',
  black: 'Black',
  grey: 'Grey',
  navy: 'Navy',
  blue: 'Blue',
  'light-blue': 'Light blue',
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple',
  beige: 'Beige',
  brown: 'Brown',
  gold: 'Gold',
  silver: 'Silver',
  multi: 'Multi',
};

export function formatAppliedOfferBadge(
  offer: Offer,
  discountPercent: number,
  facts: ProductFacts,
  partial: boolean,
): OfferBadge {
  const baseText = offer.badge?.trim() || defaultAppliedBadgeText(offer, discountPercent);
  const text = partial ? appendPartialContext(baseText, offer, facts) : baseText;
  return {
    offerId: offer.id,
    text,
    partial,
    labelOnly: false,
  };
}

export function formatLabelOnlyOfferBadge(
  offer: Offer,
  facts: ProductFacts,
  partial: boolean,
): OfferBadge | null {
  const baseText = offer.badge?.trim() || defaultLabelOnlyText(offer);
  if (!baseText) return null;
  const text = partial ? appendPartialContext(baseText, offer, facts) : baseText;
  return {
    offerId: offer.id,
    text,
    partial,
    labelOnly: true,
  };
}

export function describeOfferReward(offer: OfferDraft): string {
  const r = offer.reward;
  switch (r.kind) {
    case 'percentOff':
      return offer.scope === 'cart' ? `${r.percent}% off order` : `${r.percent}% off`;
    case 'amountOff':
      return offer.scope === 'cart'
        ? `EGP ${r.amount.toLocaleString('en-US')} off order`
        : `EGP ${r.amount.toLocaleString('en-US')} off`;
    case 'fixedPrice':
      return `Set price EGP ${r.price.toLocaleString('en-US')}`;
    case 'tiered':
      return formatTierRangeBadge(r.tiers) || offer.title;
    case 'buyXGetY':
      return r.get.percent >= 100
        ? `Buy ${r.buy.quantity}, get ${r.get.quantity} free`
        : `Buy ${r.buy.quantity}, get ${r.get.quantity} at ${r.get.percent}% off`;
    case 'bundlePrice':
      return bundleRowsText(bundleRows(r)) || 'Bundle price';
    case 'freeGift':
      return r.gifts.map((gift) => gift.name).join(' + ') || 'Free gift';
    case 'freeShipping':
      return 'Free shipping';
  }
}

function defaultAppliedBadgeText(offer: Offer, discountPercent: number): string {
  if (offer.reward.kind === 'tiered') {
    const range = formatTierRangeBadge(offer.reward.tiers);
    if (range) return range;
  }
  if (discountPercent > 0) {
    return `${discountPercent}% off`;
  }
  return offer.title;
}

function defaultLabelOnlyText(offer: Offer): string {
  const r = offer.reward;
  switch (r.kind) {
    case 'buyXGetY':
      return r.get.percent >= 100
        ? `Buy ${r.buy.quantity}, get ${r.get.quantity} free`
        : `Buy ${r.buy.quantity}, get ${r.get.quantity} at ${r.get.percent}% off`;
    case 'tiered':
      return formatTierRangeBadge(r.tiers) || offer.title;
    case 'freeShipping':
      return 'Free shipping';
    case 'bundlePrice':
      return offer.title;
    case 'freeGift':
      return 'Free gift';
    case 'percentOff':
    case 'amountOff':
      return offer.title;
    case 'fixedPrice':
      return '';
  }
}

function formatTierRangeBadge(tiers: readonly OfferTier[]): string {
  if (tiers.length === 0) return '';
  const percents = tiers
    .map((tier) => tier.percent)
    .filter((val): val is number => typeof val === 'number' && val > 0);
  if (percents.length > 0) {
    const min = Math.min(...percents);
    const max = Math.max(...percents);
    return min === max ? `${max}% off` : `${min}\u2013${max}% off`;
  }

  const amounts = tiers
    .map((tier) => tier.amount)
    .filter((val): val is number => typeof val === 'number' && val > 0);
  if (amounts.length > 0) {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return min === max ? `EGP ${max} off` : `EGP ${min}\u2013${max} off`;
  }

  return '';
}

function appendPartialContext(baseText: string, offer: Offer, facts: ProductFacts): string {
  const colors = partialColorSummary(offer.conditions, facts);
  if (colors.length === 1) {
    const label = COLOR_DISPLAY_LABELS[colors[0]] ?? colors[0];
    return `${baseText} · ${label} only`;
  }
  return baseText;
}
