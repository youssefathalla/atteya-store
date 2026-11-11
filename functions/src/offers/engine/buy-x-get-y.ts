import { bestBundle, bundleRows, splitBundleTotal, type BundleRowUse } from './bundle-price.js';
import { liveOffers } from './item-price.js';
import { matchProduct, matchVariant } from './match.js';
import type { Offer, OfferConditions, PricingContext, ProductFacts, VariantFacts } from './types.js';

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

/** One Buy X Get Y or Bundle price offer's discount on one line. */
export interface BagLineOfferDeal {
  readonly offerId: string;
  /** Pieces of the line this offer discounts (for a bundle: the line's pieces in the bundle). */
  readonly units: number;
  /** 100 = free, 50 = half price; 0 for a bundle. */
  readonly percent: number;
  /** Whole EGP taken off the line by this offer. */
  readonly discount: number;
  /** Set on a Bundle price offer's share: the pieces pay their part of the bundle total. */
  readonly bundle?: true;
}

/**
 * One Bundle price offer in the bag: the pieces it covers and what they cost, plus the next row
 * the shopper could reach ("Add 1 more to get 3 for 275 EGP").
 */
export interface BagBundle {
  readonly offerId: string;
  readonly title: string;
  /** Rows used, biggest first; empty when no row applies yet. */
  readonly rows: readonly BundleRowUse[];
  /** Pieces in the bundle (0 when none yet). */
  readonly units: number;
  /** Whole EGP those pieces cost together. */
  readonly total: number;
  /** Whole EGP saved against those pieces' own prices (before per-item offers). */
  readonly saving: number;
  /**
   * Bag line the strip and nudge sit under: the last line with pieces in the bundle, or the last
   * line that counts toward the offer while no row applies yet.
   */
  readonly lineIndex: number;
  /** The next bigger row and how many more pieces reach it; null at the top row. */
  readonly next: { readonly missing: number; readonly quantity: number; readonly price: number } | null;
}

/**
 * Pieces of one line bought (at the price before per-item offers) in a Buy X Get Y group that
 * won, whose free or discounted pieces are on other lines: "Gets you the free grip".
 */
export interface BagLineEarned {
  readonly offerId: string;
  /** Paid pieces of this line in such groups. */
  readonly units: number;
  /** 100 = free, 50 = half price. */
  readonly percent: number;
  /** The other bag lines holding the group's discounted pieces, in bag order. */
  readonly freeLines: readonly number[];
}

export interface BagLineDeals {
  /** Usually zero or one entry; two offers can each discount some pieces of one line. */
  readonly deals: readonly BagLineOfferDeal[];
  /** What this line's paid pieces earn on other lines (empty when nothing). */
  readonly earns: readonly BagLineEarned[];
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
  /** Bundle price offers the bag's pieces count toward, in the order they were worked out. */
  readonly bundles: readonly BagBundle[];
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
  const candidates = liveOffers(offers, ctx).filter(appliesToBag).sort(compareOffers);
  const first = priceInOrder(lines, candidates);
  const hasBundle = candidates.some((offer) => offer.reward.kind === 'bundlePrice');
  const hasDeal = candidates.some((offer) => offer.reward.kind === 'buyXGetY');
  if (!hasBundle || !hasDeal) return first;
  // One discount per item between a Bundle price and a Buy X Get Y offer: whichever saves the
  // shopper more. Try each kind first too, and keep the cheapest bag (a tie keeps priority order).
  const isBundle = (offer: Offer): boolean => offer.reward.kind === 'bundlePrice';
  // A Buy X Get Y discounted piece gives up its free gifts, so the gifts kept count for the shopper.
  const cost = (deals: BagDeals): number =>
    deals.lines.reduce((sum, line, index) => {
      const giftWorth = Math.max(0, Math.round(lines[index]!.giftWorth));
      return sum + line.total - (Number.isFinite(giftWorth) ? line.giftUnits * giftWorth : 0);
    }, 0);
  let best = first;
  for (const order of [
    [...candidates.filter(isBundle), ...candidates.filter((offer) => !isBundle(offer))],
    [...candidates.filter((offer) => !isBundle(offer)), ...candidates.filter(isBundle)],
  ]) {
    const priced = priceInOrder(lines, order);
    if (cost(priced) < cost(best)) best = priced;
  }
  return best;
}

/** `priceBagDeals` with the offers worked out in this order (each piece used by one offer only). */
function priceInOrder(lines: readonly BagLineFacts[], candidates: readonly Offer[]): BagDeals {
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
  const earns: BagLineEarned[][] = lines.map(() => []);
  const dealUnits = lines.map(() => 0);
  const offerIds: string[] = [];
  const hints: BagDealHint[] = [];
  const bundles: BagBundle[] = [];

  for (const offer of candidates) {
    if (offer.reward.kind === 'bundlePrice') {
      const bundle = priceBundle(offer, lines, units, deals, dealUnits);
      if (bundle) bundles.push(bundle);
      if (bundle && bundle.units > 0) offerIds.push(offer.id);
      continue;
    }
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
      addEarned(earns, offer.id, percent, group.paid, group.discounted);
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
    // Pieces in a bundle keep their free gifts, like pieces with a per-item offer.
    const discountedUnits = entries
      .filter((entry) => !entry.bundle)
      .reduce((sum, entry) => sum + entry.units, 0);
    const inDeals = Math.min(quantity, dealUnits[index]!);
    const offerUnits = quantity - inDeals;
    const { base, offer } = prices[index]!;
    const before = inDeals * base + offerUnits * offer;
    return {
      deals: entries,
      earns: earns[index]!,
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
    bundles,
  };
}

/**
 * Prices one Bundle price offer over the pieces no other offer used yet: the qualifying pieces,
 * most expensive first (after per-item offers), go into the cheapest mix of rows for the shopper;
 * the rest keep their own price. A piece in the bundle pays its share of the bundle total (split
 * by the pieces' own prices) and gets no per-item offer. Returns null when no piece qualifies.
 */
function priceBundle(
  offer: Offer,
  lines: readonly BagLineFacts[],
  units: readonly Unit[],
  deals: BagLineOfferDeal[][],
  dealUnits: number[],
): BagBundle | null {
  const rows = bundleRows(offer.reward);
  if (rows.length === 0) return null;
  const inOffer = lines.map((line) => qualifies(offer, offer.conditions, line));
  const pool = units
    .filter((unit) => !unit.used && inOffer[unit.line])
    .sort((a, b) => offerPriceOf(b) - offerPriceOf(a) || a.line - b.line);
  if (pool.length === 0) return null;

  const { pieces, cover } = bestBundle(
    rows,
    pool.map((unit) => offerPriceOf(unit)),
  );
  const bundled = pool.slice(0, pieces).sort((a, b) => a.line - b.line);
  // The strip sits under the last line with pieces in the bundle, not under a leftover piece
  // that pays its own price; with no bundle yet, under the last line that counts toward it.
  const lineIndex = Math.max(...(bundled.length > 0 ? bundled : pool).map((unit) => unit.line));
  let saving = 0;
  if (bundled.length > 0) {
    // Fill the rows biggest first with the pieces in bag order, and split each row's total.
    const share = new Map<Unit, number>();
    let at = 0;
    for (const row of cover.rows) {
      for (let n = 0; n < row.count; n++) {
        const group = bundled.slice(at, at + row.quantity);
        at += row.quantity;
        const parts = splitBundleTotal(
          row.price,
          group.map((unit) => unit.price),
        );
        group.forEach((unit, index) => share.set(unit, parts[index]!));
      }
    }
    const byLine = new Map<number, { units: number; discount: number }>();
    for (const unit of bundled) {
      unit.used = true;
      dealUnits[unit.line]! += 1;
      const entry = byLine.get(unit.line) ?? { units: 0, discount: 0 };
      entry.units += 1;
      entry.discount += Math.max(0, unit.price - (share.get(unit) ?? unit.price));
      byLine.set(unit.line, entry);
    }
    for (const [line, entry] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
      deals[line]!.push({
        offerId: offer.id,
        units: entry.units,
        percent: 0,
        discount: entry.discount,
        bundle: true,
      });
      saving += entry.discount;
    }
  }

  return {
    offerId: offer.id,
    title: offer.title,
    rows: cover.rows,
    units: bundled.length,
    total: bundled.length > 0 ? cover.total : 0,
    saving,
    lineIndex,
    next: nextBundleRow(rows, pool, lineIndex, bundled.length),
  };
}

/**
 * The next bigger row the shopper can reach by adding more of the last line's item, when adding
 * them really puts more pieces in the bundle; null once the pieces reach the top row.
 */
function nextBundleRow(
  rows: ReturnType<typeof bundleRows>,
  pool: readonly Unit[],
  lineIndex: number,
  bundledNow: number,
): BagBundle['next'] {
  const row = rows.find((candidate) => candidate.quantity > pool.length);
  if (!row) return null;
  const missing = row.quantity - pool.length;
  const like = pool.find((unit) => unit.line === lineIndex)!;
  const prices = [...pool, ...Array.from({ length: missing }, () => like)]
    .map((unit) => offerPriceOf(unit))
    .sort((a, b) => b - a);
  const after = bestBundle(rows, prices);
  if (after.pieces <= bundledNow || after.pieces < row.quantity) return null;
  return { missing, quantity: row.quantity, price: row.price };
}

/** A piece's price after per-item offers. */
function offerPriceOf(unit: Unit): number {
  return unit.price - unit.itemSaving;
}

/**
 * The small tag under a discounted item: "Free" or "−50%" when every piece has it, "1 free" or
 * "1 at −50%" when only some do. Several offers on one line are joined with " · ".
 */
export function dealTag(
  deals: readonly { readonly units: number; readonly percent: number; readonly bundle?: boolean }[],
  quantity: number,
): string {
  return deals
    .filter((deal) => deal.units > 0)
    .map((deal) => {
      if (deal.bundle) return 'Bundle price';
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

/**
 * True when adding `item` to the bag would really get it a discount from the Buy X Get Y offer
 * `offerId`: the bag is priced again with the item as one more line, so the one-discount-per-item
 * rule is applied (a free grip worth less than 10% off the racket is not free). The bag lists
 * only such products as free choices.
 */
export function freeItemWins(
  lines: readonly BagLineFacts[],
  offers: readonly Offer[],
  ctx: PricingContext,
  offerId: string,
  item: BagLineFacts,
): boolean {
  const priced = priceBagDeals([...lines, item], offers, ctx);
  const added = priced.lines[lines.length];
  return added?.deals.some((deal) => deal.offerId === offerId && deal.units > 0) ?? false;
}

/** Only per-item offers with no spend or quantity minimum give Buy X Get Y or bundle prices. */
function appliesToBag(offer: Offer): boolean {
  const kind = offer.reward.kind;
  if ((kind !== 'buyXGetY' && kind !== 'bundlePrice') || offer.scope !== 'item') return false;
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

/** Records, on each line with paid pieces in a group that won, the other lines it made cheaper. */
function addEarned(
  earns: BagLineEarned[][],
  offerId: string,
  percent: number,
  paid: readonly Unit[],
  discounted: readonly Unit[],
): void {
  const paidByLine = new Map<number, number>();
  for (const unit of paid) paidByLine.set(unit.line, (paidByLine.get(unit.line) ?? 0) + 1);
  for (const [line, units] of paidByLine) {
    const freeLines = [...new Set(discounted.map((unit) => unit.line))]
      .filter((other) => other !== line)
      .sort((a, b) => a - b);
    if (freeLines.length === 0) continue;
    const entries = earns[line]!;
    const index = entries.findIndex((entry) => entry.offerId === offerId && entry.percent === percent);
    const existing = entries[index];
    if (existing) {
      entries[index] = {
        ...existing,
        units: existing.units + units,
        freeLines: [...new Set([...existing.freeLines, ...freeLines])].sort((a, b) => a - b),
      };
    } else {
      entries.push({ offerId, units, percent, freeLines });
    }
  }
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
 * When the free piece must be another product, the bought pieces give up their per-item offers
 * for it. With a product list (`choose-free`) the bag checks each choice with `freeItemWins`; with
 * a category or brand (`add-more`) the free item isn't known, so there is no hint while the
 * bought pieces' per-item offers save anything: the bag never promises a free item the order
 * might not give.
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
  if (!samePool && !productIds && otherItemMustBeat(c, missing) > 0) return null;
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

/**
 * What the missing free pieces (another product, price unknown) would have to save for the next
 * group to win: the per-item offers its paid pieces and its free pieces already in the bag give
 * up, minus what those free pieces would save. Above 0 means it depends on the free item.
 */
function otherItemMustBeat(
  c: {
    readonly buy: number;
    readonly get: number;
    readonly percent: number;
    readonly buyPool: readonly Unit[];
    readonly getPool: readonly Unit[];
  },
  missing: number,
): number {
  // Placeholders priced above everything, so the real pieces are picked first, as in pricing.
  const placeholders: Unit[] = Array.from({ length: missing }, () => ({
    line: -1,
    price: Number.MAX_SAFE_INTEGER,
    itemSaving: 0,
    giftWorth: 0,
    used: false,
  }));
  const group = takeGroup(c.buyPool, [...c.getPool, ...placeholders], c.buy, c.get, 1);
  if (!group) return Number.POSITIVE_INFINITY;
  const real = group.discounted.filter((unit) => unit.line >= 0);
  const givenUp = [...group.paid, ...real].reduce((sum, unit) => sum + unit.itemSaving, 0);
  const saved = real.reduce((sum, unit) => sum + unitDiscount(unit.price, c.percent), 0);
  return givenUp - saved;
}

function compareOffers(a: Offer, b: Offer): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aMs = a.updatedAtMs ?? 0;
  const bMs = b.updatedAtMs ?? 0;
  if (aMs !== bMs) return bMs - aMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
