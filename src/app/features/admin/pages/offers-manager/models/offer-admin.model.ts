import {
  cairoWallTimeToDate,
  dateToCairoWallTime,
  DEFAULT_OFFER_BANNER,
  describeOfferReward,
  matchProduct,
  MAX_BUNDLE_SET_PERCENT,
  MAX_BUNDLE_SLOTS,
  offerMatch,
  type Offer,
  type OfferConditionAtom,
  type OfferConditionField,
  type OfferConditionGroup,
  type OfferBundleSlot,
  type OfferConditions,
  type OfferDraft,
  type OfferReward,
  type OfferScope,
  type PricedProduct,
} from '@core/services/offers/engine';

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
  | 'bundlePrice'
  | 'bundleSet'
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
  { id: 'bundlePrice', label: 'Bundle price' },
  { id: 'bundleSet', label: 'Bundle & Save' },
  { id: 'freeGift', label: 'Free gift' },
  { id: 'freeShipping', label: 'Free shipping' },
];

/**
 * Deal types kept in the engine but hidden from the Deal type list for launch ("Buy more, save
 * more" and "Spend X, get…" don't take the promised money off yet, ATS-135). An old offer of one of
 * these still opens, but it can't be saved.
 */
const HIDDEN_REWARD_KINDS: readonly RewardPickerKind[] = ['tiered', 'cartThreshold'];

export const UNAVAILABLE_DEAL_MESSAGE = "This deal type isn't available yet. Pause or archive this offer.";

/** The Deal type the form shows for a reward (a cart-wide percent or amount off is "Spend X, get…"). */
export function rewardPickerKind(reward: OfferReward, scope: OfferScope): RewardPickerKind {
  if (scope === 'cart' && (reward.kind === 'percentOff' || reward.kind === 'amountOff')) {
    return 'cartThreshold';
  }
  return reward.kind;
}

/** True when the offer's deal type is hidden for launch, so the form must not save it. */
export function isUnavailableDeal(reward: OfferReward, scope: OfferScope): boolean {
  return HIDDEN_REWARD_KINDS.includes(rewardPickerKind(reward, scope));
}

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

/**
 * The form only offers "Best discount wins" and "Skip products already on sale". An old offer saved
 * with "Apply on top of sale price" (`stack`) is read and saved as `bestOf`.
 */
export function withoutStackSaleItems<T extends { readonly saleItems: OfferDraft['saleItems'] }>(
  draft: T,
): T {
  return draft.saleItems === 'stack' ? { ...draft, saleItems: 'bestOf' } : draft;
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
    banner: DEFAULT_OFFER_BANNER,
  };
}

// ---------------------------------------------------------------------------------------------
// Offers list cards (ATS-219): count boxes, deal-type chips, the card text and grouping.
// ---------------------------------------------------------------------------------------------

/** The four count boxes on the Offers list. */
export type OfferListBucket = 'running' | 'later' | 'ended' | 'archived';

export const OFFER_LIST_BUCKETS: readonly { readonly id: OfferListBucket; readonly label: string }[] = [
  { id: 'running', label: 'Running now' },
  { id: 'later', label: 'Starting later' },
  { id: 'ended', label: 'Ended' },
  { id: 'archived', label: 'Archived' },
];

/** The deal-type chips under the search box. */
export type OfferDealFilter = 'all' | 'discounts' | 'gifts' | 'bundles' | 'banner';

export const OFFER_DEAL_FILTERS: readonly { readonly id: OfferDealFilter; readonly label: string }[] = [
  { id: 'all', label: 'All deal types' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'gifts', label: 'Free gifts' },
  { id: 'bundles', label: 'Bundles' },
  { id: 'banner', label: 'In top banner' },
];

/**
 * Which count box an offer counts under. The dates decide, whether the offer is on or off, so a
 * paused offer counts under Running now (with a "Paused" status) and an ended one stays ended.
 */
export function offerListBucket(offer: Offer, now: Date): OfferListBucket {
  if (offer.archived) return 'archived';
  const nowMs = now.getTime();
  if (offer.schedule.endsAt && nowMs >= offer.schedule.endsAt.getTime()) return 'ended';
  if (offer.schedule.startsAt && nowMs < offer.schedule.startsAt.getTime()) return 'later';
  return 'running';
}

/** True when the offer is one of the deal types a chip stands for. */
export function matchesDealFilter(offer: Offer, filter: OfferDealFilter): boolean {
  const kind = offer.reward.kind;
  switch (filter) {
    case 'all':
      return true;
    case 'discounts':
      return kind === 'percentOff' || kind === 'amountOff' || kind === 'fixedPrice';
    case 'gifts':
      return kind === 'freeGift';
    case 'bundles':
      return kind === 'bundlePrice' || kind === 'buyXGetY' || kind === 'bundleSet';
    case 'banner':
      return offer.banner?.show === true;
  }
}

/** The deal in a few words, as the card's large text: "50% off", "Free shirt + free socks". */
export function offerDealHeadline(offer: Offer): string {
  const r = offer.reward;
  if (r.kind === 'fixedPrice') return `New price EGP ${r.price.toLocaleString('en-US')}`;
  if (r.kind === 'bundleSet') return bundleSetDealPhrase(r);
  if (r.kind === 'freeGift' && r.gifts.length > 0) {
    return r.gifts
      .map((gift, index) => (index > 0 ? gift.name.replace(/^Free /, 'free ') : gift.name))
      .join(' + ');
  }
  return describeOfferReward(offer);
}

const CAIRO_SHORT_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function cairoShortParts(date: Date): { readonly day: string; readonly time: string } {
  const parts = CAIRO_SHORT_PARTS.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return { day: `${part('day')} ${part('month')}`, time: `${part('hour')}:${part('minute')}` };
}

/** "20 Nov, 00:00" (Cairo time), for the status line. */
export function cairoShortWithComma(date: Date): string {
  const { day, time } = cairoShortParts(date);
  return `${day}, ${time}`;
}

/** "20 Nov 00:00" (Cairo time), for the When row. */
export function cairoShort(date: Date): string {
  const { day, time } = cairoShortParts(date);
  return `${day} ${time}`;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** "Ends in 2 days", "Ends in 5 hours", "Ends in under an hour". */
function endsIn(endsAt: Date, now: Date): string {
  const left = endsAt.getTime() - now.getTime();
  if (left < HOUR_MS) return 'Ends in under an hour';
  if (left < DAY_MS) {
    const hours = Math.floor(left / HOUR_MS);
    return `Ends in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.floor(left / DAY_MS);
  return `Ends in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The When row: "Running · no end date", "20 Nov 00:00 → 29 Nov 23:59", "Ends in 2 days". */
export function offerWhenLine(offer: Offer, now: Date): string {
  const { startsAt, endsAt } = offer.schedule;
  const bucket = offerListBucket(offer, now);
  if (bucket === 'running') {
    return endsAt ? endsIn(endsAt, now) : 'Running · no end date';
  }
  const start = startsAt ? cairoShort(startsAt) : 'Any time';
  const end = endsAt ? cairoShort(endsAt) : 'no end date';
  return `${start} → ${end}`;
}

/** The status line's text and dot: "Live · In top banner", "Paused", "Starts 20 Nov, 00:00". */
export interface OfferStatusLine {
  readonly text: string;
  /** Green dot for a live offer; none for every other status. */
  readonly live: boolean;
}

export function offerStatusLine(offer: Offer, now: Date): OfferStatusLine {
  const bucket = offerListBucket(offer, now);
  const paused = !offer.active;
  switch (bucket) {
    case 'archived':
      return { text: 'Archived', live: false };
    case 'ended':
      return { text: `Ended ${cairoShortWithComma(offer.schedule.endsAt as Date)}`, live: false };
    case 'later': {
      const starts = `Starts ${cairoShortWithComma(offer.schedule.startsAt as Date)}`;
      return { text: paused ? `${starts} · Paused` : starts, live: false };
    }
    case 'running':
      if (paused) return { text: 'Paused', live: false };
      return { text: offer.banner?.show ? 'Live · In top banner' : 'Live', live: true };
  }
}

/** "Everyone" or "Signed-in shoppers". */
export function offerAudienceLabel(offer: Offer): string {
  return offer.audience === 'signedIn' ? 'Signed-in shoppers' : 'Everyone';
}

/**
 * Ids of the products an offer reaches (fully or for some sizes or colours). A Bundle & Save offer
 * keeps its products in its groups, so it uses the editor's rule: a product counts when it fits any group.
 */
export function affectedProductIds(offer: Offer, products: readonly PricedProduct[]): Set<string> {
  const ids = new Set<string>();
  for (const product of products) {
    if (editorOfferMatch(offer, product) !== 'none') ids.add(product.productId);
  }
  return ids;
}

/** One offer on the list, with the text its card shows. */
export interface OfferCardItem {
  readonly offer: Offer;
  readonly bucket: OfferListBucket;
  readonly status: OfferStatusLine;
  readonly headline: string;
  readonly when: string;
  readonly who: string;
  readonly productIds: ReadonlySet<string>;
  readonly coversAll: boolean;
}

/** One card: a single offer, or several offers with the same name and deal type. */
export interface OfferCardView {
  /** The first offer's id for a single card; `group:<…>` for a group. */
  readonly key: string;
  readonly items: readonly OfferCardItem[];
  readonly bucket: OfferListBucket;
  readonly statusText: string;
  readonly live: boolean;
  readonly headline: string;
  readonly name: string;
  readonly title: string;
  readonly affected: string;
  readonly who: string;
  readonly when: string;
  /** At least one offer in the card is on (the switch shows on; turning it off turns them all off). */
  readonly on: boolean;
  /** Running and Starting later cards have the on/off switch; Ended and Archived don't. */
  readonly hasSwitch: boolean;
}

/**
 * One offer's card text. `productIds` comes from `affectedProductIds()`, worked out once per load
 * (the time-based text is worked out again as the clock moves).
 */
export function toOfferCardItem(offer: Offer, productIds: ReadonlySet<string>, now: Date): OfferCardItem {
  return {
    offer,
    bucket: offerListBucket(offer, now),
    status: offerStatusLine(offer, now),
    headline: offerDealHeadline(offer),
    when: offerWhenLine(offer, now),
    who: offerAudienceLabel(offer),
    productIds,
    // Bundle & Save leaves `conditions` empty (its products live in the groups), so it never covers all.
    coversAll:
      offer.reward.kind !== 'bundleSet' &&
      offer.conditions.anyOf.length === 0 &&
      offer.exclude.anyOf.length === 0,
  };
}

function affectedText(items: readonly OfferCardItem[], productCount: number): string {
  if (items.some((item) => item.coversAll)) return `${productCount} (all)`;
  const ids = new Set<string>();
  for (const item of items) for (const id of item.productIds) ids.add(id);
  return String(ids.size);
}

/** A grouped card's status when its offers' own statuses differ. */
const GROUP_STATUS: Readonly<Record<OfferListBucket, string>> = {
  running: 'Paused',
  later: 'Starting later',
  ended: 'Ended',
  archived: 'Archived',
};

/** The value when every entry is the same, else `fallback`. */
function sameOr(values: readonly string[], fallback: string): string {
  return values.every((value) => value === values[0]) ? values[0] : fallback;
}

/** What shoppers read, trimmed, lower case, with runs of spaces as one. */
function titleKey(item: OfferCardItem): string {
  return item.offer.title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function groupKey(item: OfferCardItem): string {
  return `${item.bucket}|${rewardPickerKind(item.offer.reward, item.offer.scope)}|${titleKey(item)}`;
}

/**
 * Builds the cards in list order. Offers in the same count box with the same customer title
 * (case and spaces ignored) and the same deal type become one card; the rest stay one card each.
 * The title, not the internal name, is what they share: the 6 "Free shirt and socks" offers each
 * name their own bag internally.
 */
export function groupOfferCards(items: readonly OfferCardItem[], productCount: number): OfferCardView[] {
  const groups = new Map<string, OfferCardItem[]>();
  for (const item of items) {
    const key = items.length > 1 && titleKey(item) ? groupKey(item) : `single|${item.offer.id}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.values()].map((list) => {
    const first = list[0];
    const on = list.some((item) => item.offer.active);
    const hasSwitch = first.bucket === 'running' || first.bucket === 'later';
    const whoValues = [...new Set(list.map((item) => item.who))];
    if (list.length === 1) {
      return {
        key: first.offer.id,
        items: list,
        bucket: first.bucket,
        statusText: first.status.text,
        live: first.status.live,
        headline: first.headline,
        name: first.offer.name,
        title: first.offer.title,
        affected: affectedText(list, productCount),
        who: first.who,
        when: first.when,
        on,
        hasSwitch,
      };
    }
    const liveItem = list.find((item) => item.status.live);
    const lead = liveItem
      ? 'Live'
      : sameOr(
          list.map((item) => item.status.text),
          GROUP_STATUS[first.bucket],
        );
    return {
      key: `group:${list.map((item) => item.offer.id).join(',')}`,
      items: list,
      bucket: first.bucket,
      statusText: `${lead} · ${list.length} offers`,
      live: !!liveItem,
      headline: [...new Set(list.map((item) => item.headline))].join(' · '),
      // Each offer has its own internal name; the shared title names the group.
      name: first.offer.title.trim(),
      title: first.offer.title,
      affected: affectedText(list, productCount),
      who: whoValues.join(' / '),
      when: sameOr(
        list.map((item) => item.when),
        'Different dates',
      ),
      on,
      hasSwitch,
    };
  });
}

/** One offer as its own card (Open Group shows each offer this way). */
export function singleOfferCard(item: OfferCardItem, productCount: number): OfferCardView {
  return groupOfferCards([item], productCount)[0];
}

// ---------------------------------------------------------------------------------------------
// 4-step offer editor (ATS-220): deal cards, product tags, the summary sentence, auto names, dates.
// ---------------------------------------------------------------------------------------------

/** The editor's steps, in order. */
export type OfferEditorStep = 1 | 2 | 3 | 4;

export const OFFER_EDITOR_STEPS: readonly { readonly id: OfferEditorStep; readonly label: string }[] = [
  { id: 1, label: 'The deal' },
  { id: 2, label: 'Which products' },
  { id: 3, label: 'Who and when' },
  { id: 4, label: 'Check and start' },
];

/** The Next button's label for each step ("Next: Which Products"). */
export const NEXT_STEP_LABEL: Readonly<Record<OfferEditorStep, string>> = {
  1: 'Next: Which Products',
  2: 'Next: Who and When',
  3: 'Next: Check and Start',
  4: '',
};

/** One deal card on step 1. */
export interface DealCard {
  readonly id: RewardPickerKind;
  /** Large symbol on the card ("%", "−EGP"); null shows `icon` instead. */
  readonly symbol: string | null;
  readonly icon: string | null;
  readonly label: string;
  readonly example: string;
}

const ALL_DEAL_CARDS: readonly DealCard[] = [
  { id: 'percentOff', symbol: '%', icon: null, label: 'Percent off', example: '20% off rackets' },
  { id: 'amountOff', symbol: '−EGP', icon: null, label: 'Money off', example: 'EGP 200 off each bag' },
  { id: 'fixedPrice', symbol: '=EGP', icon: null, label: 'New price', example: 'All shirts at EGP 499' },
  { id: 'bundlePrice', symbol: '2 for', icon: null, label: 'Bundle price', example: '2 socks for EGP 200' },
  {
    id: 'bundleSet',
    symbol: 'A+B',
    icon: null,
    label: 'Bundle & Save',
    example: 'Racket + bag, save 15%',
  },
  {
    id: 'buyXGetY',
    symbol: '2+1',
    icon: null,
    label: 'Buy some, get one free',
    example: 'Buy 2 balls, get 1 free',
  },
  { id: 'freeGift', symbol: '+ Free', icon: null, label: 'Free gift', example: 'Free socks with a bag' },
  {
    id: 'freeShipping',
    symbol: null,
    icon: 'local_shipping',
    label: 'Free shipping',
    example: 'Egypt orders only',
  },
];

/** The deal cards, only for the deal types the form allows (hidden ones stay hidden). */
export const DEAL_CARDS: readonly DealCard[] = ALL_DEAL_CARDS.filter((card) =>
  REWARD_PICKER_OPTIONS.some((option) => option.id === card.id),
);

/** Quick buttons under Percent off. */
export const QUICK_PERCENTS: readonly number[] = [10, 20, 30, 50];

/** The reward, scope and minimum a deal card starts with (same defaults the old Deal type list used). */
export function defaultDealFor(kind: RewardPickerKind): {
  readonly reward: OfferReward;
  readonly scope: OfferScope;
  readonly minimum: null;
} {
  switch (kind) {
    case 'amountOff':
      return { reward: { kind: 'amountOff', amount: 200 }, scope: 'item', minimum: null };
    case 'fixedPrice':
      return { reward: { kind: 'fixedPrice', price: 1000 }, scope: 'item', minimum: null };
    case 'buyXGetY':
      return {
        reward: {
          kind: 'buyXGetY',
          buy: { quantity: 2 },
          get: { quantity: 1, percent: 100 },
          getConditions: null,
          cheapestFree: true,
          repeat: true,
          maxApplications: null,
        },
        scope: 'item',
        minimum: null,
      };
    case 'bundlePrice':
      // An item offer with no minimum: the bag groups the qualifying pieces into the rows.
      return {
        reward: { kind: 'bundlePrice', rows: [{ quantity: 2, price: 200 }] },
        scope: 'item',
        minimum: null,
      };
    case 'bundleSet':
      // An item offer with no minimum: the bag finds the full sets. Staff name the groups, pick
      // their products and type the set price (empty until then, so the form asks for it).
      return {
        reward: {
          kind: 'bundleSet',
          slots: [newBundleSlot([]), newBundleSlot([newBundleSlot([])])],
          setReward: { type: 'total', price: 0 },
          maxSets: null,
        },
        scope: 'item',
        minimum: null,
      };
    case 'freeGift':
      // One set of gifts per qualifying item bought, so it is an item offer with no minimum.
      return {
        reward: { kind: 'freeGift', gifts: [{ id: 'gift-1', name: 'Free gift', productIds: [] }] },
        scope: 'item',
        minimum: null,
      };
    case 'freeShipping':
      // The minimum is optional: start empty so the offer covers every Egypt order unless staff type one.
      return { reward: { kind: 'freeShipping' }, scope: 'cart', minimum: null };
    default:
      return { reward: { kind: 'percentOff', percent: 10 }, scope: 'item', minimum: null };
  }
}

/** A field the Include / Leave out tags can hold. */
export type TargetField = 'categoryIds' | 'brandId' | 'productId';

export const TARGET_FIELD_LABEL: Readonly<Record<TargetField, string>> = {
  categoryIds: 'Category',
  brandId: 'Brand',
  productId: 'Product',
};

const TARGET_FIELDS: readonly TargetField[] = ['categoryIds', 'brandId', 'productId'];

/** One Include or Leave out tag: "Category T-shirts". */
export interface TargetTag {
  readonly field: TargetField;
  readonly value: string;
}

/** Condition groups read as simple tags, plus the groups that don't fit a tag ("Advanced rule"). */
export interface TargetView {
  readonly tags: readonly TargetTag[];
  readonly advanced: readonly OfferConditionGroup[];
}

function isTargetField(field: OfferConditionField): field is TargetField {
  return (TARGET_FIELDS as readonly string[]).includes(field);
}

/** A group fits a tag when it has one "is one of" rule on category, brand or product with values. */
function simpleGroup(group: OfferConditionGroup): { field: TargetField; values: readonly string[] } | null {
  if (group.allOf.length !== 1) return null;
  const atom = group.allOf[0];
  if (atom.field === 'price' || !isTargetField(atom.field)) return null;
  if (atom.notIn !== undefined || !atom.in || atom.in.length === 0) return null;
  return { field: atom.field, values: atom.in };
}

/** Reads saved condition groups as tags; the rest stay as they are. */
export function readTargets(conditions: OfferConditions): TargetView {
  const tags: TargetTag[] = [];
  const advanced: OfferConditionGroup[] = [];
  const seen = new Set<string>();
  for (const group of conditions.anyOf) {
    const simple = simpleGroup(group);
    if (!simple) {
      advanced.push(group);
      continue;
    }
    for (const value of simple.values) {
      const key = `${simple.field}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push({ field: simple.field, value });
    }
  }
  return { tags, advanced };
}

/**
 * Builds condition groups from tags: one "is one of" group per field (values of the same field
 * merged, category, brand, product), then the advanced groups as they were.
 */
export function writeTargets(view: TargetView): OfferConditions {
  const groups: OfferConditionGroup[] = [];
  for (const field of TARGET_FIELDS) {
    const values = view.tags.filter((tag) => tag.field === field).map((tag) => tag.value);
    if (values.length > 0) {
      // More than 200 values is refused by validateOffer ("Each rule can pick up to 200 values.").
      groups.push({ allOf: [{ field, in: values }] });
    }
  }
  return { anyOf: [...groups, ...view.advanced] };
}

/** Names for the ids the tags and sentences show. */
export interface CatalogNames {
  readonly categories: ReadonlyMap<string, string>;
  readonly brands: ReadonlyMap<string, string>;
  readonly products: ReadonlyMap<string, string>;
}

export function targetName(tag: TargetTag, names: CatalogNames): string {
  const map =
    tag.field === 'categoryIds' ? names.categories : tag.field === 'brandId' ? names.brands : names.products;
  return map.get(tag.value) ?? `${TARGET_FIELD_LABEL[tag.field]} not found`;
}

const FIELD_WORD: Readonly<Record<OfferConditionField, string>> = {
  brandId: 'brand',
  categoryIds: 'category',
  type: 'type',
  colors: 'colour',
  sizes: 'size',
  modelGroup: 'model',
  tags: 'tag',
  productId: 'product',
  price: 'price',
};

function atomValueName(field: OfferConditionField, value: string, names: CatalogNames): string {
  if (field === 'categoryIds') return names.categories.get(value) ?? value;
  if (field === 'brandId') return names.brands.get(value) ?? value;
  if (field === 'productId') return names.products.get(value) ?? value;
  return value;
}

function listNames(values: readonly string[], joiner: 'or' | 'and'): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length <= 3) return `${values.slice(0, -1).join(', ')} ${joiner} ${values[values.length - 1]}`;
  return `${values.slice(0, 2).join(', ')} ${joiner} ${values.length - 2} more`;
}

/** An advanced group in plain words: "brand is Adidas and size is not M or L". */
export function describeConditionGroup(group: OfferConditionGroup, names: CatalogNames): string {
  const parts = group.allOf.map((atom) => {
    const word = FIELD_WORD[atom.field];
    if (atom.field === 'price') {
      if (atom.min !== undefined && atom.max !== undefined) {
        return `price from EGP ${atom.min.toLocaleString('en-US')} to EGP ${atom.max.toLocaleString('en-US')}`;
      }
      if (atom.min !== undefined) return `price EGP ${atom.min.toLocaleString('en-US')} or more`;
      if (atom.max !== undefined) return `price up to EGP ${atom.max.toLocaleString('en-US')}`;
      return 'any price';
    }
    const not = atom.notIn !== undefined;
    const values = (atom.in ?? atom.notIn ?? []).map((value) => atomValueName(atom.field, value, names));
    if (values.length === 0) return `${word} not picked yet`;
    return `${word} ${not ? 'is not' : 'is'} ${listNames(values, 'or')}`;
  });
  return parts.join(' and ') || 'Empty rule';
}

/** The products part of the sentence, or null for every product: "T-shirts except Bullpadel". */
export function offerTargetPhrase(
  conditions: OfferConditions,
  exclude: OfferConditions,
  names: CatalogNames,
): string | null {
  const include = readTargets(conditions);
  const leaveOut = readTargets(exclude);
  const includeNames = include.tags.map((tag) => targetName(tag, names));
  if (include.advanced.length > 0) includeNames.push('selected products');
  const excludeNames = leaveOut.tags.map((tag) => targetName(tag, names));
  if (leaveOut.advanced.length > 0) excludeNames.push('some products');
  const base = includeNames.length > 0 ? listNames(includeNames, 'and') : null;
  if (excludeNames.length === 0) return base;
  return `${base ?? 'everything'} except ${listNames(excludeNames, 'and')}`;
}

/** "1 product", "12 products". */
export function productCountLabel(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'product' : 'products'}`;
}

function egp(amount: number): string {
  return `EGP ${amount.toLocaleString('en-US')}`;
}

/** The deal in a few words for the sentence and the step 4 box: "15% off", "Buy 2, get 1 free". */
export function offerDealPhrase(draft: OfferDraft): string {
  const r = draft.reward;
  switch (r.kind) {
    case 'fixedPrice':
      return `New price ${egp(r.price)}`;
    case 'bundleSet':
      return bundleSetDealPhrase(r);
    case 'freeGift':
      return (
        r.gifts
          .map((gift) => gift.name.trim())
          .filter(Boolean)
          .join(' + ') || 'Free gift'
      );
    default:
      return describeOfferReward(draft);
  }
}

/** The customer title filled in from the deal and products, at most 60 characters: "20% off Rackets". */
export function autoOfferTitle(draft: OfferDraft, names: CatalogNames): string {
  const target = offerTargetPhrase(draft.conditions, draft.exclude, names);
  const r = draft.reward;
  let title: string;
  switch (r.kind) {
    case 'percentOff':
    case 'amountOff':
      title = target ? `${describeOfferReward(draft)} ${target}` : describeOfferReward(draft);
      break;
    case 'fixedPrice':
      title = `${target ?? 'Everything'} at ${egp(r.price)}`;
      break;
    case 'freeGift': {
      const gifts = offerDealPhrase(draft);
      title = target ? `${gifts} with ${target}` : gifts;
      break;
    }
    case 'freeShipping':
      title = 'Free shipping';
      break;
    case 'bundleSet':
      // The groups already name the products, so the title is the deal itself.
      title = bundleSetDealPhrase(r);
      break;
    default:
      title = target ? `${describeOfferReward(draft)} on ${target}` : describeOfferReward(draft);
  }
  return title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title;
}

/** Short deal words for the team name: "15%", "EGP 200 off", "2 for EGP 200". */
function teamDealWords(draft: OfferDraft): string {
  const r = draft.reward;
  switch (r.kind) {
    case 'percentOff':
      return `${r.percent}%`;
    case 'amountOff':
      return `${egp(r.amount)} off`;
    case 'fixedPrice':
      return egp(r.price);
    case 'buyXGetY':
      return `Buy ${r.buy.quantity} get ${r.get.quantity}`;
    case 'freeGift':
      return 'free gift';
    case 'freeShipping':
      return 'free shipping';
    default:
      return describeOfferReward(draft);
  }
}

const CAIRO_DAY_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface CairoDay {
  readonly weekday: string;
  readonly day: number;
  readonly month: string;
  readonly year: number;
}

function cairoDay(date: Date): CairoDay {
  const parts = CAIRO_DAY_PARTS.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    weekday: part('weekday'),
    day: Number.parseInt(part('day'), 10),
    month: part('month'),
    year: Number.parseInt(part('year'), 10),
  };
}

/** The internal name filled in for staff, at most 80 characters: "T-shirts 15% · late November". */
export function autoTeamName(draft: OfferDraft, names: CatalogNames, now: Date): string {
  const target = offerTargetPhrase(draft.conditions, draft.exclude, names);
  const r = draft.reward;
  const lead =
    r.kind === 'freeShipping'
      ? 'Free shipping'
      : r.kind === 'bundleSet'
        ? `${bundleSlotsPhrase(r.slots)} Bundle & Save`
        : `${target ?? 'Everything'} ${teamDealWords(draft)}`;
  const start = cairoDay(draft.schedule.startsAt ?? now);
  const part = start.day <= 9 ? 'early' : start.day <= 19 ? 'mid' : 'late';
  const name = `${lead} · ${part} ${start.month}`;
  return name.length > 80 ? `${name.slice(0, 79).trimEnd()}…` : name;
}

/** "20 November", or "Friday 20 November" when `long`; the year only when it isn't this year's. */
function dayText(date: Date, now: Date, long: boolean): string {
  const day = cairoDay(date);
  const year = day.year !== cairoDay(now).year ? ` ${day.year}` : '';
  return `${long ? `${day.weekday} ` : ''}${day.day} ${day.month}${year}`;
}

/** The when part of the sentence: "from 20 to 29 November", "until 29 November", "from now on". */
export function offerWhenPhrase(schedule: OfferDraft['schedule'], now: Date, long = false): string {
  const { startsAt, endsAt } = schedule;
  if (!startsAt && !endsAt) return 'from now on';
  if (!startsAt) return `until ${dayText(endsAt as Date, now, long)}`;
  if (!endsAt) return `from ${dayText(startsAt, now, long)}`;
  const start = cairoDay(startsAt);
  const end = cairoDay(endsAt);
  if (!long && start.month === end.month && start.year === end.year) {
    if (start.day === end.day) return `on ${dayText(endsAt, now, false)}`;
    return `from ${start.day} to ${dayText(endsAt, now, false)}`;
  }
  return `from ${dayText(startsAt, now, long)} to ${dayText(endsAt, now, long)}`;
}

/** "everyone" or "signed-in shoppers". */
export function offerWhoPhrase(draft: OfferDraft): string {
  return draft.audience === 'signedIn' ? 'signed-in shoppers' : 'everyone';
}

/** One piece of the "Your offer so far" sentence; a placeholder shows grey until its step is done. */
export interface SentencePart {
  readonly text: string;
  readonly placeholder: boolean;
}

/**
 * "15% off T-shirts except Bullpadel, for everyone, from 20 to 29 November." Parts of steps
 * not reached yet show as "[which products]", "[who]", "[when]".
 */
export function offerSentence(
  draft: OfferDraft,
  names: CatalogNames,
  doneUpTo: number,
  now: Date,
): SentencePart[] {
  const parts: SentencePart[] = [{ text: offerDealPhrase(draft), placeholder: false }];
  if (draft.reward.kind === 'bundleSet') {
    // The groups (step 1) name the products; step 2 can only leave some out.
    const leftOut = leaveOutPhrase(draft.exclude, names);
    if (leftOut) parts.push({ text: `, ${leftOut}`, placeholder: false });
  } else if (draft.reward.kind !== 'freeShipping') {
    if (doneUpTo >= 2) {
      const target = offerTargetPhrase(draft.conditions, draft.exclude, names);
      parts.push({
        text: ` ${target ? (draft.reward.kind === 'freeGift' ? `with ${target}` : target) : 'on every product'}`,
        placeholder: false,
      });
    } else {
      parts.push({ text: ' ', placeholder: false }, { text: '[which products]', placeholder: true });
    }
  }
  parts.push({ text: ', for ', placeholder: false });
  if (doneUpTo >= 3) {
    parts.push({
      text: `${offerWhoPhrase(draft)}, ${offerWhenPhrase(draft.schedule, now)}`,
      placeholder: false,
    });
  } else {
    parts.push(
      { text: '[who]', placeholder: true },
      { text: ', ', placeholder: false },
      { text: '[when]', placeholder: true },
    );
  }
  parts.push({ text: '.', placeholder: false });
  return parts;
}

/** The step 4 sentence under the deal: "T-shirts except Bullpadel, for everyone, from Friday 20 November to Sunday 29 November." */
export function offerCheckSentence(draft: OfferDraft, names: CatalogNames, now: Date): string {
  const target = offerTargetPhrase(draft.conditions, draft.exclude, names);
  const products =
    draft.reward.kind === 'freeShipping'
      ? 'Egypt orders'
      : draft.reward.kind === 'bundleSet'
        ? capitalise(bundleGroupsPhrase(draft.reward.slots, draft.exclude, names))
        : target
          ? capitalise(target)
          : 'Every product';
  return `${products}, for ${offerWhoPhrase(draft)}, ${offerWhenPhrase(draft.schedule, now, true)}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DAY_MS_CAIRO = 24 * 60 * 60 * 1000;

/** Calendar days in Cairo from the first day to the last, both counted (20 to 29 November = 10). */
export function runDays(startsAt: Date, endsAt: Date): number {
  const dayNumber = (date: Date): number => {
    const wall = dateToCairoWallTime(date);
    return Math.round(Date.UTC(wall.year, wall.month - 1, wall.day) / DAY_MS_CAIRO);
  };
  return Math.max(1, dayNumber(endsAt) - dayNumber(startsAt) + 1);
}

/** "10 days", "1 day". */
export function daysLabel(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The line under the dates: lead text, the bold part (days) and the rest. */
export interface RunLine {
  readonly lead: string;
  readonly bold: string;
  readonly rest: string;
}

export function offerRunLine(schedule: OfferDraft['schedule'], now: Date): RunLine {
  const { startsAt, endsAt } = schedule;
  if (!endsAt) {
    return startsAt
      ? { lead: `Starts ${dayText(startsAt, now, true)} and runs until you turn it off.`, bold: '', rest: '' }
      : { lead: 'Runs from the moment you start it until you turn it off.', bold: '', rest: '' };
  }
  const days = daysLabel(runDays(startsAt ?? now, endsAt));
  if (!startsAt) return { lead: 'Runs for ', bold: days, rest: `, until ${dayText(endsAt, now, true)}.` };
  return {
    lead: 'Runs for ',
    bold: days,
    rest: `, from ${dayText(startsAt, now, true)} to ${dayText(endsAt, now, true)}.`,
  };
}

/** Quick end-date buttons on step 3. */
export type QuickEnd = '3d' | '1w' | '2w' | 'month';

export const QUICK_ENDS: readonly { readonly id: QuickEnd; readonly label: string }[] = [
  { id: '3d', label: '3 days' },
  { id: '1w', label: '1 week' },
  { id: '2w', label: '2 weeks' },
  { id: 'month', label: 'End of month' },
];

/**
 * The end a quick button sets, at 23:59:59 Cairo time: the start day counts as day 1, so
 * "1 week" from Friday 20 November ends Thursday 26 November. End of month = the start's month.
 */
export function quickEndDate(quick: QuickEnd, from: Date): Date {
  const wall = dateToCairoWallTime(from);
  let year = wall.year;
  let month = wall.month;
  let day = wall.day;
  if (quick === 'month') {
    day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  } else {
    const add = quick === '3d' ? 2 : quick === '1w' ? 6 : 13;
    const next = new Date(Date.UTC(year, month - 1, day + add));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return cairoWallTimeToDate({ year, month, day, hour: 23, minute: 59, second: 59 });
}

/** Which step each validation message belongs to, so it shows on that step. */
export function issueStep(code: string): OfferEditorStep {
  if (code === 'title' || code.startsWith('reward.')) return 1;
  if (code.startsWith('conditions.') || code.startsWith('exclude.')) return 2;
  if (code === 'name') return 4;
  return 3;
}

/** Products a draft reaches: how many, in stock, sold out and already on sale. */
export interface AffectedStats {
  readonly total: number;
  readonly inStock: number;
  readonly soldOut: number;
  readonly onSale: number;
}

/** Counts for the products a draft reaches (already matched): in stock, sold out, already on sale. */
export function affectedStats(
  matched: readonly { readonly priced: PricedProduct; readonly inStock: boolean }[],
): AffectedStats {
  let inStock = 0;
  let onSale = 0;
  for (const { priced, inStock: available } of matched) {
    if (available) inStock += 1;
    if (priced.compareAtPrice !== null && priced.compareAtPrice > priced.price) onSale += 1;
  }
  return { total: matched.length, inStock, soldOut: matched.length - inStock, onSale };
}

// ---------------------------------------------------------------------------------------------
// Bundle & Save (ATS-253): groups, the deal in plain words and which form field an error is about.
// ---------------------------------------------------------------------------------------------

type BundleSetReward = Extract<OfferReward, { kind: 'bundleSet' }>;

/** Quick buttons under a Bundle & Save percent. */
export const BUNDLE_QUICK_PERCENTS: readonly number[] = [10, 20, 30];

/** What one full set saves, as the radio list shows it. */
export const BUNDLE_SAVING_OPTIONS: readonly {
  readonly id: BundleSetReward['setReward']['type'];
  readonly label: string;
}[] = [
  { id: 'total', label: 'Set price' },
  { id: 'percent', label: 'Percent off' },
  { id: 'amount', label: 'Amount off' },
  { id: 'cheapestFree', label: 'Cheapest item free' },
];

/** A new empty group with the next free id (`slot-1`, `slot-2`, …): 1 piece, nothing picked yet. */
export function newBundleSlot(existing: readonly OfferBundleSlot[]): OfferBundleSlot {
  const used = new Set(existing.map((slot) => slot.id));
  let index = existing.length + 1;
  while (used.has(`slot-${index}`)) index++;
  return { id: `slot-${index}`, name: '', quantity: 1, conditions: { anyOf: [] } };
}

/** True while another group can be added (up to `MAX_BUNDLE_SLOTS`). */
export function canAddBundleSlot(slots: readonly OfferBundleSlot[]): boolean {
  return slots.length < MAX_BUNDLE_SLOTS;
}

/** The group's name, or "Group 2" while it has none. */
function slotName(slot: OfferBundleSlot, index: number): string {
  return slot.name.trim() || `Group ${index + 1}`;
}

/** "Racket", or "2 × Ball" for a group of 2 pieces. */
function slotLabel(slot: OfferBundleSlot, index: number): string {
  const name = slotName(slot, index);
  return slot.quantity > 1 ? `${slot.quantity} × ${name}` : name;
}

/** "Racket + Bag + Grip". */
export function bundleSlotsPhrase(slots: readonly OfferBundleSlot[]): string {
  return slots.map(slotLabel).join(' + ') || 'Bundle';
}

/** "a Racket", "an Apron", "2 Balls" is written "2 × Ball" to keep the staff's own word. */
function slotWithArticle(slot: OfferBundleSlot, index: number): string {
  if (slot.quantity > 1) return slotLabel(slot, index);
  const name = slotName(slot, index);
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * The deal in plain words: "Racket + Bag for EGP 4,500", "Racket + Bag + Grip: save 15%",
 * "Racket + Bag: save EGP 500", "Buy a Racket and a Bag, get the cheapest free".
 */
export function bundleSetDealPhrase(reward: BundleSetReward): string {
  const set = reward.setReward;
  const groups = bundleSlotsPhrase(reward.slots);
  switch (set.type) {
    case 'total':
      return Number.isInteger(set.price) && set.price > 0
        ? `${groups} for ${egp(set.price)}`
        : `${groups} for a set price`;
    case 'percent':
      return Number.isInteger(set.percent) && set.percent >= 1 && set.percent <= MAX_BUNDLE_SET_PERCENT
        ? `${groups}: save ${set.percent}%`
        : `${groups}: save on the set`;
    case 'amount':
      return Number.isInteger(set.amount) && set.amount > 0
        ? `${groups}: save ${egp(set.amount)}`
        : `${groups}: save on the set`;
    case 'cheapestFree':
      return `Buy ${joinAll(reward.slots.map(slotWithArticle))}, get the cheapest free`;
  }
}

/** Every name, "a, b and c" (a Bundle & Save offer has at most 4 groups, so none are cut). */
function joinAll(values: readonly string[]): string {
  return values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}

/** "leaving out Bullpadel", or null when nothing is left out. */
function leaveOutPhrase(exclude: OfferConditions, names: CatalogNames): string | null {
  const leftOut = offerTargetPhrase({ anyOf: [] }, exclude, names);
  return leftOut ? `leaving out ${leftOut.replace(/^everything except /, '')}` : null;
}

/** Each group and its products: "Racket from Rackets, Bag from Bags and Adidas, leaving out Bullpadel". */
export function bundleGroupsPhrase(
  slots: readonly OfferBundleSlot[],
  exclude: OfferConditions,
  names: CatalogNames,
): string {
  const groups = slots.map((slot, index) => {
    const from = offerTargetPhrase(slot.conditions, { anyOf: [] }, names);
    return `${slotLabel(slot, index)} from ${from ?? 'nothing picked yet'}`;
  });
  const leftOut = leaveOutPhrase(exclude, names);
  return [...groups, ...(leftOut ? [leftOut] : [])].join(', ');
}

/**
 * How a product fits the draft while it is being edited. Like the engine's `offerMatch()`, except
 * that a Bundle & Save draft that can't be saved yet still counts the products of the groups that
 * have something picked, so the count on step 2 follows the groups as staff fill them in.
 */
export function editorOfferMatch(
  draft: Pick<OfferDraft, 'conditions' | 'exclude' | 'reward'>,
  product: PricedProduct,
): 'full' | 'partial' | 'none' {
  const r = draft.reward;
  if (r.kind !== 'bundleSet') return offerMatch(draft, product);
  const own = matchProduct(draft.conditions, draft.exclude, product);
  if (own === 'none') return 'none';
  let best: 'full' | 'partial' | 'none' = 'none';
  for (const slot of r.slots) {
    if (slot.conditions.anyOf.length === 0) continue;
    const level = matchProduct(slot.conditions, draft.exclude, product);
    if (level === 'full') {
      best = 'full';
      break;
    }
    if (level === 'partial') best = 'partial';
  }
  if (best === 'none') return 'none';
  return own === 'full' && best === 'full' ? 'full' : 'partial';
}

/** Which part of the Bundle & Save form an error is about, so it shows under that part. */
export type BundleSetIssueField = 'groups' | 'saving' | 'limit';

export function bundleSetIssueField(code: string): BundleSetIssueField | null {
  if (code === 'reward.bundleSlots' || code.startsWith('reward.bundleSlot')) return 'groups';
  if (code.startsWith('reward.bundleSet')) return 'saving';
  if (code === 'reward.bundleMaxSets') return 'limit';
  return null;
}
