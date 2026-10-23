import {
  describeOfferReward,
  formatCairoDisplay,
  matchProduct,
  type Offer,
  type OfferConditionField,
  type OfferDraft,
  type PricedProduct,
} from '@core/services/offers/engine';

export type OfferStatusFilter = 'all' | 'live' | 'scheduled' | 'ended' | 'archived';
export type OfferComputedStatus = 'live' | 'scheduled' | 'ended' | 'paused' | 'archived';

export interface OfferTableRow {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly status: OfferComputedStatus;
  readonly rewardSummary: string;
  readonly matchSummary: string;
  readonly datesSummary: string;
  readonly priority: number;
  readonly active: boolean;
  readonly archived: boolean;
  readonly code: string | null;
}

export interface ConditionFieldOption {
  readonly id: OfferConditionField;
  readonly label: string;
}

export const CONDITION_FIELD_OPTIONS: readonly ConditionFieldOption[] = [
  { id: 'brandId', label: 'Brand' },
  { id: 'categoryIds', label: 'Category' },
  { id: 'type', label: 'Product type' },
  { id: 'colors', label: 'Colour' },
  { id: 'sizes', label: 'Size' },
  { id: 'modelGroup', label: 'Model group' },
  { id: 'tags', label: 'Tag' },
  { id: 'productId', label: 'Specific product' },
  { id: 'price', label: 'Price (EGP)' },
];

export type RewardPickerKind =
  | 'percentOff'
  | 'amountOff'
  | 'fixedPrice'
  | 'buyXGetY'
  | 'tiered'
  | 'freeGift'
  | 'freeShipping'
  | 'cartThreshold';

export interface RewardPickerOption {
  readonly id: RewardPickerKind;
  readonly label: string;
}

export const REWARD_PICKER_OPTIONS: readonly RewardPickerOption[] = [
  { id: 'percentOff', label: 'Percent off' },
  { id: 'amountOff', label: 'Amount off' },
  { id: 'fixedPrice', label: 'Set price' },
  { id: 'buyXGetY', label: 'Buy X get Y' },
  { id: 'tiered', label: 'Buy more, save more' },
  { id: 'freeGift', label: 'Free gift' },
  { id: 'freeShipping', label: 'Free shipping' },
  { id: 'cartThreshold', label: 'Spend X, get…' },
];

export function createEmptyOfferDraft(): OfferDraft {
  return {
    name: '',
    title: '',
    badge: null,
    description: null,
    active: false,
    archived: false,
    visibility: 'public',
    audience: 'everyone',
    schedule: {
      startsAt: null,
      endsAt: null,
      timezone: 'Africa/Cairo',
    },
    priority: 0,
    stacking: 'stackable',
    saleItems: 'bestOf',
    scope: 'item',
    conditions: { anyOf: [] },
    exclude: { anyOf: [] },
    minimum: null,
    reward: { kind: 'percentOff', percent: 10 },
    limits: { totalUses: null, perCustomer: null },
    requiresCode: false,
    code: null,
  };
}

export function computeOfferStatus(offer: Offer, now: Date): OfferComputedStatus {
  if (offer.archived) return 'archived';
  if (!offer.active) return 'paused';
  const nowMs = now.getTime();
  if (offer.schedule.startsAt && nowMs < offer.schedule.startsAt.getTime()) {
    return 'scheduled';
  }
  if (offer.schedule.endsAt && nowMs >= offer.schedule.endsAt.getTime()) {
    return 'ended';
  }
  return 'live';
}

export function toOfferTableRow(
  offer: Offer,
  products: readonly PricedProduct[],
  now: Date,
): OfferTableRow {
  const status = computeOfferStatus(offer, now);
  let fullCount = 0;
  let partialCount = 0;

  for (const product of products) {
    const level = matchProduct(offer.conditions, offer.exclude, product);
    if (level === 'full') fullCount += 1;
    else if (level === 'partial') partialCount += 1;
  }

  const totalMatches = fullCount + partialCount;
  const matchSummary =
    offer.conditions.anyOf.length === 0
      ? `All products (${products.length})`
      : partialCount > 0
        ? `${totalMatches} (${partialCount} partly)`
        : `${totalMatches} ${totalMatches === 1 ? 'product' : 'products'}`;

  const startText = formatCairoDisplay(offer.schedule.startsAt) || 'Starts now';
  const endText = formatCairoDisplay(offer.schedule.endsAt) || 'No end date';

  return {
    id: offer.id,
    name: offer.name,
    title: offer.title,
    status,
    rewardSummary: describeOfferReward(offer),
    matchSummary,
    datesSummary: `${startText} \u2192 ${endText}`,
    priority: offer.priority,
    active: offer.active,
    archived: offer.archived,
    code: offer.code ?? null,
  };
}
