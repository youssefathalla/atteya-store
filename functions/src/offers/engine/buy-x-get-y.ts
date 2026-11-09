import { liveOffers } from './item-price.js';
import { matchProduct, matchVariant } from './match.js';
import type {
  Offer,
  OfferConditions,
  PricingContext,
  ProductFacts,
  VariantFacts,
} from './types.js';

/** What Buy X Get Y needs to know about one bag line. */
export interface BagLineFacts {
  readonly product: ProductFacts;
  readonly variant: VariantFacts | null;
  readonly quantity: number;
  /** One piece in whole EGP after per-item offers (`priceItem().effectivePrice`). */
  readonly unitPrice: number;
  /** The product has a compare-at price above its price (for the offer's sale-items rule). */
  readonly onSale: boolean;
  /**
   * What the free gifts one piece of this line comes with are worth (the gift products' prices,
   * whole EGP); 0 when the line has no gifts. A piece never gets both a gift and a Buy X Get Y
   * discount: the one worth more to the shopper wins.
   */
  readonly giftWorth: number;
}

/** One Buy X Get Y offer's discount on one line. */
export interface BagLineOfferDeal {
  readonly offerId: string;
  /** Pieces of the line this offer discounts. */
  readonly units: number;
  /** 100 = free, 50 = half price. */
  readonly percent: number;
  /** Whole EGP taken off the line by this offer. */
  readonly discount: number;
}

export interface BagLineDeals {
  /** Usually zero or one entry; two offers can each discount some pieces of one line. */
  readonly deals: readonly BagLineOfferDeal[];
  /** Whole EGP taken off the line. */
  readonly discount: number;
  /** Pieces with a discount (they get no free gifts). */
  readonly discountedUnits: number;
  /** Pieces that still come with the line's free gifts. */
  readonly giftUnits: number;
}

/**
 * A nudge shown in the bag:
 * - `add-more`: the shopper is `missing` pieces short of one more group. `samePool` = the free
 *   pieces come from the same items ("Add 1 more to get 1 free").
 * - `choose-free`: the group is complete but the free piece must be one of `productIds` and
 *   none (or not enough) is in the bag.
 */
export interface BagDealHint {
  readonly kind: 'add-more' | 'choose-free';
  readonly offerId: string;
  readonly title: string;
  /** Bag line the hint sits under (the last line that counts towards the offer). */
  readonly lineIndex: number;
  readonly missing: number;
  /** Pieces discounted when the group is complete. */
  readonly free: number;
  readonly percent: number;
  readonly samePool: boolean;
  /** Only on `choose-free`: the products the free piece can be. */
  readonly productIds: readonly string[];
}

export interface BagDeals {
  /** One entry per bag line, in bag order. */
  readonly lines: readonly BagLineDeals[];
  /** Whole EGP taken off the bag. */
  readonly discount: number;
  /** Buy X Get Y offers that gave a discount (each counts once towards its limits). */
  readonly offerIds: readonly string[];
  readonly hints: readonly BagDealHint[];
}

interface Unit {
  readonly line: number;
  readonly price: number;
  readonly giftWorth: number;
  used: boolean;
}

/**
 * Prices a whole bag for live Buy X Get Y offers. For each offer (highest priority first), every
 * complete group of `buy.quantity` qualifying pieces discounts `get.quantity` pieces by
 * `get.percent`: pieces that match `getConditions`, or the same qualifying items when there are
 * none (then a group is buy + get pieces, so "Buy 2, get 1 free" needs 3). The discounted pieces
 * are always the cheapest that can be. `repeat` allows more than one group, up to
 * `maxApplications`. A piece used by one offer (bought or discounted) is not used by another.
 * Shared by the bag, checkout and the order callables, so the server charges what the bag shows.
 */
export function priceBagDeals(
  lines: readonly BagLineFacts[],
  offers: readonly Offer[],
  ctx: PricingContext,
): BagDeals {
  const units: Unit[] = [];
  lines.forEach((line, index) => {
    const quantity = Math.max(0, Math.floor(line.quantity));
    const price = Math.max(0, Math.round(line.unitPrice));
    const giftWorth = Math.max(0, Math.round(line.giftWorth));
    for (let n = 0; n < quantity; n++) units.push({ line: index, price, giftWorth, used: false });
  });

  const deals: BagLineOfferDeal[][] = lines.map(() => []);
  const offerIds: string[] = [];
  const hints: BagDealHint[] = [];

  const candidates = liveOffers(offers, ctx).filter(appliesToBag).sort(compareOffers);
  for (const offer of candidates) {
    if (offer.reward.kind !== 'buyXGetY') continue;
    const r = offer.reward;
    const buy = Math.max(1, Math.floor(r.buy.quantity));
    const get = Math.max(1, Math.floor(r.get.quantity));
    const percent = Math.min(100, Math.max(1, Math.round(r.get.percent)));
    const maxGroups = maxApplications(r.repeat, r.maxApplications);

    const inBuy = lines.map((line) => qualifies(offer, offer.conditions, line));
    const getConditions = r.getConditions;
    const inGet = lines.map((line, index) =>
      getConditions === null ? inBuy[index]! : qualifies(offer, getConditions, line),
    );
    const free = units.filter((unit) => !unit.used);
    const buyPool = free.filter((unit) => inBuy[unit.line]);
    const getPool = free.filter(
      (unit) => inGet[unit.line] && unitDiscount(unit.price, percent) > unit.giftWorth,
    );

    const counts = poolCounts(buyPool, getPool);
    let groups = 0;
    while (groups < maxGroups && fits(groups + 1, buy, get, counts)) groups++;

    if (groups > 0) {
      const discounted = pickDiscounted(buyPool, getPool, groups * buy, groups * get);
      for (const unit of discounted) unit.used = true;
      const getSet = new Set(getPool);
      const paid = buyPool
        .filter((unit) => !unit.used)
        .sort((a, b) => Number(getSet.has(a)) - Number(getSet.has(b)) || b.price - a.price)
        .slice(0, groups * buy);
      for (const unit of paid) unit.used = true;
      addDeals(deals, offer.id, percent, discounted);
      offerIds.push(offer.id);
    }

    if (groups < maxGroups) {
      const hint = nextGroupHint(offer, {
        buy,
        get,
        percent,
        buyPool: buyPool.filter((unit) => !unit.used),
        getPool: getPool.filter((unit) => !unit.used),
      });
      if (hint) hints.push(hint);
    }
  }

  const lineDeals = lines.map((line, index): BagLineDeals => {
    const entries = deals[index]!;
    const discount = entries.reduce((sum, entry) => sum + entry.discount, 0);
    const discountedUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
    return {
      deals: entries,
      discount,
      discountedUnits,
      giftUnits: Math.max(0, Math.floor(line.quantity) - discountedUnits),
    };
  });

  return {
    lines: lineDeals,
    discount: lineDeals.reduce((sum, line) => sum + line.discount, 0),
    offerIds,
    hints,
  };
}

/**
 * The small tag under a discounted item: "Free" or "−50%" when every piece has it, "1 free" or
 * "1 at −50%" when only some do. Several offers on one line are joined with " · ".
 */
export function dealTag(
  deals: readonly { readonly units: number; readonly percent: number }[],
  quantity: number,
): string {
  return deals
    .filter((deal) => deal.units > 0)
    .map((deal) => {
      const all = deal.units >= quantity;
      if (deal.percent >= 100) return all ? 'Free' : `${deal.units} free`;
      return all ? `\u2212${deal.percent}%` : `${deal.units} at \u2212${deal.percent}%`;
    })
    .join(' · ');
}

/** Whole EGP one piece saves at `percent` off. */
export function unitDiscount(price: number, percent: number): number {
  return Math.min(price, Math.max(0, Math.round((price * percent) / 100)));
}

/**
 * The product ids of a free-item rule that names products only ("one of these 3 grips"), or
 * null when it picks by category or brand (or is the same items).
 */
export function freeItemProductIds(conditions: OfferConditions | null): string[] | null {
  if (!conditions || conditions.anyOf.length === 0) return null;
  const ids: string[] = [];
  for (const group of conditions.anyOf) {
    if (group.allOf.length !== 1) return null;
    const atom = group.allOf[0]!;
    if (atom.field !== 'productId' || !atom.in || atom.in.length === 0 || (atom.notIn?.length ?? 0) > 0) {
      return null;
    }
    for (const id of atom.in) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * True when a product can be the free (or discounted) piece of a Buy X Get Y offer: it matches the
 * offer's free-item rule (or its own conditions when the free piece comes from the same items),
 * isn't excluded, and isn't on sale when the offer leaves sale items out. The bag lists only such
 * products as free choices, so a tapped choice is really discounted.
 */
export function canBeFreeItem(offer: Offer, product: ProductFacts, onSale: boolean): boolean {
  if (offer.reward.kind !== 'buyXGetY') return false;
  const conditions = offer.reward.getConditions ?? offer.conditions;
  return qualifies(offer, conditions, {
    product,
    variant: null,
    quantity: 1,
    unitPrice: product.price,
    onSale,
    giftWorth: 0,
  });
}

/** Only per-item offers with no spend or quantity minimum give Buy X Get Y discounts. */
function appliesToBag(offer: Offer): boolean {
  if (offer.reward.kind !== 'buyXGetY' || offer.scope !== 'item') return false;
  const minimum = offer.minimum;
  return !minimum || ((minimum.subtotal ?? 0) <= 0 && (minimum.quantity ?? 0) <= 0);
}

function qualifies(offer: Offer, conditions: OfferConditions, line: BagLineFacts): boolean {
  if (line.onSale && offer.saleItems === 'exclude') return false;
  if (matchProduct(conditions, offer.exclude, line.product) === 'none') return false;
  return line.variant === null || matchVariant(conditions, offer.exclude, line.product, line.variant);
}

function maxApplications(repeat: boolean, max: number | null): number {
  const cap = max === null || !Number.isFinite(max) ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
  return repeat ? cap : Math.min(1, cap);
}

interface PoolCounts {
  /** Pieces that can only be bought (not discounted). */
  readonly buyOnly: number;
  /** Pieces that can only be discounted. */
  readonly getOnly: number;
  /** Pieces that can be either. */
  readonly both: number;
}

function poolCounts(buyPool: readonly Unit[], getPool: readonly Unit[]): PoolCounts {
  const getSet = new Set(getPool);
  const both = buyPool.filter((unit) => getSet.has(unit)).length;
  return { buyOnly: buyPool.length - both, getOnly: getPool.length - both, both };
}

/** True when `groups` groups fit: enough pieces to buy and to discount, never the same piece twice. */
function fits(groups: number, buy: number, get: number, counts: PoolCounts): boolean {
  const needBoth =
    Math.max(0, groups * buy - counts.buyOnly) + Math.max(0, groups * get - counts.getOnly);
  return needBoth <= counts.both;
}

/**
 * The `getCount` cheapest pieces that can be discounted, keeping `buyCount` pieces to buy.
 * A piece that could be bought is taken only while enough others are left to buy.
 */
function pickDiscounted(
  buyPool: readonly Unit[],
  getPool: readonly Unit[],
  buyCount: number,
  getCount: number,
): Unit[] {
  const buySet = new Set(buyPool);
  let spareBuyers = buyPool.length - buyCount;
  const picked: Unit[] = [];
  const sorted = [...getPool].sort((a, b) => a.price - b.price || b.line - a.line);
  for (const unit of sorted) {
    if (picked.length >= getCount) break;
    if (buySet.has(unit)) {
      if (spareBuyers <= 0) continue;
      spareBuyers--;
    }
    picked.push(unit);
  }
  return picked;
}

function addDeals(
  deals: BagLineOfferDeal[][],
  offerId: string,
  percent: number,
  discounted: readonly Unit[],
): void {
  const byLine = new Map<number, { units: number; discount: number }>();
  for (const unit of discounted) {
    const entry = byLine.get(unit.line) ?? { units: 0, discount: 0 };
    entry.units += 1;
    entry.discount += unitDiscount(unit.price, percent);
    byLine.set(unit.line, entry);
  }
  for (const [line, entry] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    deals[line]!.push({ offerId, percent, units: entry.units, discount: entry.discount });
  }
}

/**
 * What the shopper still needs for one more group, when it is only the free part: the fewest
 * pieces (at most `get`) that would complete it. Nothing when even the bought part is short.
 */
function nextGroupHint(
  offer: Offer,
  c: {
    readonly buy: number;
    readonly get: number;
    readonly percent: number;
    readonly buyPool: readonly Unit[];
    readonly getPool: readonly Unit[];
  },
): BagDealHint | null {
  if (offer.reward.kind !== 'buyXGetY' || c.buyPool.length === 0) return null;
  const samePool = offer.reward.getConditions === null;
  const counts = poolCounts(c.buyPool, c.getPool);
  let missing = 0;
  for (let extra = 1; extra <= c.get; extra++) {
    const withExtra = samePool
      ? { ...counts, both: counts.both + extra }
      : { ...counts, getOnly: counts.getOnly + extra };
    if (fits(1, c.buy, c.get, withExtra)) {
      missing = extra;
      break;
    }
  }
  if (missing === 0) return null;
  const productIds = samePool ? null : freeItemProductIds(offer.reward.getConditions);
  return {
    kind: productIds ? 'choose-free' : 'add-more',
    offerId: offer.id,
    title: offer.title,
    lineIndex: Math.max(...c.buyPool.map((unit) => unit.line)),
    missing,
    free: c.get,
    percent: c.percent,
    samePool,
    productIds: productIds ?? [],
  };
}

function compareOffers(a: Offer, b: Offer): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aMs = a.updatedAtMs ?? 0;
  const bMs = b.updatedAtMs ?? 0;
  if (aMs !== bMs) return bMs - aMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
