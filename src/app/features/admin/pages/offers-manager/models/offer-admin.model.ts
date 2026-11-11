import {
  DEFAULT_OFFER_BANNER,
  describeOfferReward,
  matchProduct,
  type Offer,
  type OfferConditionAtom,
  type OfferConditionField,
  type OfferConditionGroup,
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
      return kind === 'bundlePrice' || kind === 'buyXGetY';
    case 'banner':
      return offer.banner?.show === true;
  }
}

/** The deal in a few words, as the card's large text: "50% off", "Free shirt + free socks". */
export function offerDealHeadline(offer: Offer): string {
  const r = offer.reward;
  if (r.kind === 'fixedPrice') return `New price EGP ${r.price.toLocaleString('en-US')}`;
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

/** Ids of the products an offer reaches (fully or for some sizes or colours). */
export function affectedProductIds(offer: Offer, products: readonly PricedProduct[]): Set<string> {
  const ids = new Set<string>();
  for (const product of products) {
    if (matchProduct(offer.conditions, offer.exclude, product) !== 'none') ids.add(product.productId);
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
    coversAll: offer.conditions.anyOf.length === 0 && offer.exclude.anyOf.length === 0,
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
