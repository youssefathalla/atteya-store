import {
  describeOfferReward,
  formatCairoDisplay,
  matchProduct,
  type Offer,
  type OfferConditionAtom,
  type OfferConditionField,
  type OfferConditionGroup,
  type OfferConditions,
  type OfferDraft,
  type OfferReward,
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

/** Which item becomes free in a Buy X get Y offer. */
export type FreeItemMode = 'cheapest' | 'products' | 'categoryBrand';

export interface FreeItemOption {
  readonly id: FreeItemMode;
  readonly label: string;
}

export const FREE_ITEM_OPTIONS: readonly FreeItemOption[] = [
  { id: 'cheapest', label: 'The cheapest of them' },
  { id: 'products', label: 'One of these products' },
  { id: 'categoryBrand', label: 'Any item from a category or brand' },
];

/** The most values one free-item choice can hold (same cap as every condition rule). */
export const MAX_FREE_ITEM_VALUES = 200;

export interface FreeItemSelection {
  readonly productIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly brandIds: readonly string[];
}

type BuyXGetYReward = Extract<OfferReward, { kind: 'buyXGetY' }>;

function setAtoms(conditions: OfferConditions | null): readonly OfferConditionAtom[] {
  return conditions?.anyOf.flatMap((group) => group.allOf) ?? [];
}

function valuesOf(atoms: readonly OfferConditionAtom[], field: OfferConditionField): string[] {
  const values: string[] = [];
  for (const atom of atoms) {
    if (atom.field === field && atom.field !== 'price') values.push(...(atom.in ?? []));
  }
  return values;
}

/** Reads the saved free-item choice back into the mode and picked values. */
export function readFreeItem(reward: BuyXGetYReward): {
  readonly mode: FreeItemMode;
  readonly selection: FreeItemSelection;
} {
  const atoms = setAtoms(reward.getConditions);
  const mode: FreeItemMode = !reward.getConditions
    ? 'cheapest'
    : atoms.some((atom) => atom.field === 'productId')
      ? 'products'
      : 'categoryBrand';
  return {
    mode,
    selection: {
      productIds: valuesOf(atoms, 'productId'),
      categoryIds: valuesOf(atoms, 'categoryIds'),
      brandIds: valuesOf(atoms, 'brandId'),
    },
  };
}

/**
 * Builds the reward for a free-item choice. Picking a mode with nothing chosen yet keeps an
 * empty rule, so the editor remembers the mode; validation stops the save until values are
 * picked, and `withoutEmptyFreeItemRules` cleans up before it is written.
 */
export function withFreeItem(
  reward: BuyXGetYReward,
  mode: FreeItemMode,
  selection: FreeItemSelection,
): BuyXGetYReward {
  let getConditions: OfferConditions | null = null;
  if (mode === 'products') {
    getConditions = { anyOf: [{ allOf: [{ field: 'productId', in: selection.productIds }] }] };
  } else if (mode === 'categoryBrand') {
    getConditions = {
      anyOf: [
        { allOf: [{ field: 'categoryIds', in: selection.categoryIds }] },
        { allOf: [{ field: 'brandId', in: selection.brandIds }] },
      ],
    };
  }
  return { ...reward, getConditions, cheapestFree: true };
}

/** Drops free-item rules with nothing picked, so the saved offer never holds an empty rule. */
export function withoutEmptyFreeItemRules(draft: OfferDraft): OfferDraft {
  const r = draft.reward;
  if (r.kind !== 'buyXGetY' || !r.getConditions) return draft;
  const anyOf = r.getConditions.anyOf.filter((group: OfferConditionGroup) =>
    group.allOf.some((atom) => atom.field === 'price' || (atom.in?.length ?? 0) > 0),
  );
  return { ...draft, reward: { ...r, getConditions: { anyOf } } };
}

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
