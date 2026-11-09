// GENERATED — edit functions/src/offers/engine
import { liveOffers } from './item-price';
import { matchProduct, matchVariant } from './match';
import type { Offer, OfferConditions, PricingContext, ProductFacts, VariantFacts } from './types';

/** What Buy X Get Y needs to know about one bag line. */
export interface BagLineFacts {
  readonly product: ProductFacts;
  readonly variant: VariantFacts | null;
  readonly quantity: number;
  /**
   * One piece in whole EGP before per-item offers: the product's price (the sale price when it is
   * on sale; `priceItem().basePrice`). Buy X Get Y groups are worked out on this price.
   */
  readonly basePrice: number;
  /**
   * One piece in whole EGP after per-item offers (Percent off, Amount off, Set price;
   * `priceItem().effectivePrice`), at most `basePrice`. A piece outside every Buy X Get Y group,
   * or in a group whose per-item offers save more, pays this.
   */
  readonly offerPrice: number;
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
  /** Whole EGP Buy X Get Y takes off the line, from the price before per-item offers. */
  readonly discount: number;
  /** Pieces with a discount (they get no free gifts). */
  readonly discountedUnits: number;
  /** Pieces that still come with the line's free gifts. */
  readonly giftUnits: number;
  /**
   * Pieces in a Buy X Get Y group that won (bought or discounted): they pay `basePrice`, before
   * the deal's discount, and get no per-item offer. One discount per item, never both.
   */
  readonly dealUnits: number;
  /** Pieces that keep the per-item offer price (`offerPrice`): `quantity − dealUnits`. */
  readonly offerUnits: number;
  /** Whole EGP before the Buy X Get Y discount: `dealUnits × basePrice + offerUnits × offerPrice`. */
  readonly before: number;
  /** Whole EGP the line costs: `before − discount`. */
  readonly total: number;
}

/**
 * A nudge shown in the bag:
 * - `add-more`: the shopper is `missing` pieces short of one more group. `samePool` = the free
 *   pieces come from the same items, and `missing` then counts the bought part too ("Add 2 more
 *   to get 1 free" with one item of "Buy 2, get 1 free").
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
  /** Before per-item offers. */
  readonly price: number;
  /** What the per-item offer saves on this piece (`basePrice − offerPrice`). */
  readonly itemSaving: number;
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
 *
 * One discount per item: groups are worked out on each piece's price before per-item offers
 * (`basePrice`), and each group's pieces get either the Buy X Get Y discount or their per-item
 * offers (`offerPrice`), whichever saves the shopper more in total (a tie keeps the per-item
 * offers). A group whose per-item offers win doesn't count: its pieces keep their offer price,
 * the offer gives no discount for it, and another Buy X Get Y offer may still use them.
 * Shared by the bag, checkout and the order callables, so the server charges what the bag shows.
 */
export function priceBagDeals(
  lines: readonly BagLineFacts[],
  offers: readonly Offer[],
  ctx: PricingContext,
): BagDeals {
  const units: Unit[] = [];
  const prices = lines.map(linePrices);
  lines.forEach((line, index) => {
    const quantity = Math.max(0, Math.floor(line.quantity));
    const { base, offer } = prices[index]!;
    const giftWorth = Math.max(0, Math.round(line.giftWorth));
    for (let n = 0; n < quantity; n++) {
      units.push({ line: index, price: base, itemSaving: base - offer, giftWorth, used: false });
    }
  });

  const deals: BagLineOfferDeal[][] = lines.map(() => []);
  const dealUnits = lines.map(() => 0);
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
    let buyPool = free.filter((unit) => inBuy[unit.line]);
    let getPool = free.filter(
      (unit) => inGet[unit.line] && unitDiscount(unit.price, percent) > unit.giftWorth,
    );

    let groups = 0;
    while (groups < maxGroups && fits(groups + 1, buy, get, poolCounts(buyPool, getPool))) groups++;

    // Groups one at a time, so each one is compared with its pieces' per-item offers on its own.
    // Every group taken (won or not) leaves this offer's pools, so `groups` groups always fit.
    const discounted: Unit[] = [];
    for (let left = groups; left > 0; left--) {
      const group = takeGroup(buyPool, getPool, buy, get, left);
      if (!group) break;
      const taken = new Set([...group.paid, ...group.discounted]);
      buyPool = buyPool.filter((unit) => !taken.has(unit));
      getPool = getPool.filter((unit) => !taken.has(unit));
      if (!dealWins(group.paid, group.discounted, percent)) continue;
      for (const unit of taken) {
        unit.used = true;
        dealUnits[unit.line]! += 1;
      }
      discounted.push(...group.discounted);
    }
    if (discounted.length > 0) {
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
    const quantity = Math.max(0, Math.floor(line.quantity));
    const discount = entries.reduce((sum, entry) => sum + entry.discount, 0);
    const discountedUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
    const inDeals = Math.min(quantity, dealUnits[index]!);
    const offerUnits = quantity - inDeals;
    const { base, offer } = prices[index]!;
    const before = inDeals * base + offerUnits * offer;
    return {
      deals: entries,
      discount,
      discountedUnits,
      giftUnits: Math.max(0, quantity - discountedUnits),
      dealUnits: inDeals,
      offerUnits,
      before,
      total: Math.max(0, before - discount),
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
    basePrice: product.price,
    offerPrice: product.price,
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
  const needBoth = Math.max(0, groups * buy - counts.buyOnly) + Math.max(0, groups * get - counts.getOnly);
  return needBoth <= counts.both;
}

/** A line's whole-EGP prices: before per-item offers, and after them (never above `base`). */
function linePrices(line: BagLineFacts): { base: number; offer: number } {
  const base = Math.max(0, Math.round(line.basePrice));
  const offer = Math.min(base, Math.max(0, Math.round(line.offerPrice)));
  return { base, offer };
}

/**
 * One group: the `get` cheapest pieces that can be discounted (the smaller per-item saving first
 * when prices tie), and `buy` pieces to buy, those that can't be discounted first, then the ones
 * whose per-item offers save least (they give up the least), then the most expensive. A piece
 * that could be bought is discounted only while enough others are left to buy for the `groups`
 * groups still to take; null when the pools no longer fit.
 */
function takeGroup(
  buyPool: readonly Unit[],
  getPool: readonly Unit[],
  buy: number,
  get: number,
  groups: number,
): { paid: Unit[]; discounted: Unit[] } | null {
  const buySet = new Set(buyPool);
  let spareBuyers = buyPool.length - groups * buy;
  const discounted: Unit[] = [];
  const sorted = [...getPool].sort(
    (a, b) => a.price - b.price || a.itemSaving - b.itemSaving || b.line - a.line,
  );
  for (const unit of sorted) {
    if (discounted.length >= get) break;
    if (buySet.has(unit)) {
      if (spareBuyers <= 0) continue;
      spareBuyers--;
    }
    discounted.push(unit);
  }
  if (discounted.length < get) return null;
  const getSet = new Set(getPool);
  const picked = new Set(discounted);
  const paid = buyPool
    .filter((unit) => !picked.has(unit))
    .sort(
      (a, b) =>
        Number(getSet.has(a)) - Number(getSet.has(b)) || a.itemSaving - b.itemSaving || b.price - a.price,
    )
    .slice(0, buy);
  if (paid.length < buy) return null;
  return { paid, discounted };
}

/**
 * True when Buy X Get Y saves the shopper more on these pieces than their per-item offers do.
 * A tie keeps the per-item offers.
 */
function dealWins(paid: readonly Unit[], discounted: readonly Unit[], percent: number): boolean {
  const dealSaving = discounted.reduce((sum, unit) => sum + unitDiscount(unit.price, percent), 0);
  const itemSaving = [...paid, ...discounted].reduce((sum, unit) => sum + unit.itemSaving, 0);
  return dealSaving > itemSaving;
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
 * What the shopper still needs for one more group: the fewest pieces that would complete it.
 * When the free pieces come from the same items this counts the bought part too, so one item of
 * "Buy 2, get 1 free" asks for 2 more. When the free piece must be another product, the bought
 * part has to be complete first and only the free part (at most `get`) is asked for.
 * When the free pieces come from the same items and the group would still lose to the pieces'
 * per-item offers (more of the same item, priced like the line the hint sits under), there is no
 * hint: adding them would not get the shopper anything free.
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
  const maxExtra = samePool ? c.buy + c.get - 1 : c.get;
  let missing = 0;
  for (let extra = 1; extra <= maxExtra; extra++) {
    const withExtra = samePool
      ? { ...counts, both: counts.both + extra }
      : { ...counts, getOnly: counts.getOnly + extra };
    if (fits(1, c.buy, c.get, withExtra)) {
      missing = extra;
      break;
    }
  }
  if (missing === 0) return null;
  const lineIndex = Math.max(...c.buyPool.map((unit) => unit.line));
  if (samePool) {
    const like = c.buyPool.find((unit) => unit.line === lineIndex)!;
    const extra: Unit[] = Array.from({ length: missing }, () => ({ ...like, giftWorth: 0, used: false }));
    const group = takeGroup([...c.buyPool, ...extra], [...c.getPool, ...extra], c.buy, c.get, 1);
    if (!group || !dealWins(group.paid, group.discounted, c.percent)) return null;
  }
  const productIds = samePool ? null : freeItemProductIds(offer.reward.getConditions);
  return {
    kind: productIds ? 'choose-free' : 'add-more',
    offerId: offer.id,
    title: offer.title,
    lineIndex,
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
