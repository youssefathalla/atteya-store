import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getActiveOffers } from '../offers/offer-cache.js';
import {
  boxesForRegion,
  liveOffers,
  parcelWeight,
  planDelivery,
  priceBagDeals,
  priceItem,
  type BagLineFacts,
  type BagLineDeals,
  shippingQuote,
  type DeliveryPlan,
  type Offer,
  type ParcelLine,
  type PricedProduct,
  type PricingContext,
  type ShippingQuote,
  type ShippingQuoteLine,
  type ShippingRegion,
  type ShippingSettings,
  type VariantFacts,
} from '../offers/engine/index.js';
import { parseCheckoutShippingConfig, SHIPPING_DOC_PATH } from '../shipping/shipping-settings.js';
import {
  confirmedEndedOfferIds,
  offerFullError,
  type OfferCustomerKeys,
  type UsedOffer,
  type UsedOfferKind,
} from './offer-usage.js';
import { giftProductIds, resolveLineGifts, stockDemandKey, type ResolvedGift } from './order-gifts.js';
import type { CreateStoreOrderRequest, OrderLineInput, StorePaymentMethod } from './order-request.js';
import { assertCurrentSelection } from './order-selection.js';

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'failed';
export type OrderPaymentMethod = StorePaymentMethod;
export type OrderFulfilment =
  'domestic-cod' | 'domestic-instapay' | 'domestic-paymob' | 'international-paymob';

/** One chosen option, saved as the shopper saw it (e.g. `Size` → `M`). */
export interface OrderLineOptionLabel {
  readonly label: string;
  readonly value: string;
}

export interface OrderLinePrice {
  readonly productId: string;
  readonly variantId: string | null;
  readonly selection: Readonly<Record<string, string>>;
  readonly quantity: number;
  readonly unitEgp: number;
  readonly unitDisplay: number;
  readonly lineDisplay: number;
  /**
   * Snapshot of what was bought, saved when the order is placed so emails and the
   * dashboard still show it after the product is renamed or removed.
   * Older orders don't have these fields.
   */
  readonly name: string;
  readonly optionLabels: readonly OrderLineOptionLabel[];
  /** Storage path of the main photo (`products/…`), or null when the product has none. */
  readonly imagePath: string | null;
  /** Set on a free gift line (price 0): which offer and gift, and the line it came with. */
  readonly gift?: OrderLineGift;
  /**
   * Whole EGP a Buy X Get Y offer took off this line (`lineDisplay` is already after it).
   * Missing on lines without one, and on older orders.
   */
  readonly discountEgp?: number;
  /** The Buy X Get Y offers behind `discountEgp`: which pieces got which discount. */
  readonly deals?: readonly OrderLineDeal[];
  /**
   * The line before its Buy X Get Y discount (`lineDisplay` + `discountEgp`): pieces in a Buy X
   * Get Y group pay the price before per-item offers, the others `unitEgp`. Only on lines with
   * pieces in a group; older orders and other lines use `unitEgp × quantity`.
   */
  readonly fullEgp?: number;
}

/** One Buy X Get Y discount on an order line, e.g. 1 piece free (`percent` 100). */
export interface OrderLineDeal {
  readonly offerId: string;
  /** Pieces of the line discounted. */
  readonly units: number;
  /** 100 = free, 50 = half price. */
  readonly percent: number;
  readonly discountEgp: number;
}

/** Marks an order line as a free gift. Gift lines follow the line they belong to. */
export interface OrderLineGift {
  readonly offerId: string;
  readonly giftId: string;
  /** The gift's name as shoppers saw it, e.g. "Free shirt". */
  readonly giftName: string;
  /** Index in `pricing.lines` of the bought line this gift came with. */
  readonly forLine: number;
}

export interface OrderShippingLine {
  /**
   * `domestic-zone` is legacy; new Egypt orders use `domestic-box`.
   * `domestic-agreed`: an Egypt order heavier than the biggest box. Staff agree the fee with the
   * shopper on WhatsApp and save it with `setDeliveryFee`; until then `feeAgreed` is false and
   * the price is 0 (and the order total is the items only).
   */
  readonly kind: 'domestic-zone' | 'domestic-box' | 'international-box' | 'domestic-agreed';
  readonly boxId: string | null;
  readonly priceEgp: number;
  readonly priceDisplay: number;
  /** Only on `domestic-agreed`: true once staff saved the fee. */
  readonly feeAgreed?: boolean;
}

export interface OrderPricingSnapshot {
  readonly isInternational: boolean;
  readonly shippingCountry: string;
  readonly currency: 'EGP';
  readonly rate: 1;
  readonly markupPercent: 0;
  readonly ratesUpdatedAt: string;
  readonly lines: readonly OrderLinePrice[];
  readonly subtotalEgp: number;
  readonly subtotalDisplay: number;
  readonly shipping: OrderShippingLine | null;
  readonly totalDisplay: number;
  /** Whole EGP pounds charged (Paymob amount_cents = totalEgp * 100). */
  readonly totalEgp: number;
  readonly fulfilment: OrderFulfilment;
}

export interface PricedStoreOrder {
  readonly pricing: OrderPricingSnapshot;
  /**
   * Offers this order uses: Free gift offers it gives gifts from, Buy X Get Y offers that discount
   * it, Percent off, Amount off and Set price offers that lower at least one piece, and a Free
   * shipping offer that made the shipping free (each counts once towards its limits).
   */
  readonly usedOffers: readonly UsedOffer[];
}

/**
 * Server-authoritative checkout pricing for Paymob and Egypt COD.
 * Always quotes and charges in whole Egyptian pounds (Paymob Egypt Accept).
 */
export async function priceStoreOrder(
  db: Firestore,
  input: CreateStoreOrderRequest,
  signedIn: boolean,
  uid: OfferCustomerKeys,
): Promise<PricedStoreOrder> {
  const [shippingSnap, giftDocs] = await Promise.all([
    db.doc(SHIPPING_DOC_PATH).get(),
    readGiftDocs(db, giftProductIds(input.lines)),
  ]);
  const shippingConfig = parseCheckoutShippingConfig(shippingSnap.data());
  return priceWithFreshOffersOnMiss(
    (fresh) => getActiveOffers(db, fresh),
    (offers) => priceWithOffers(db, input, signedIn, uid, offers, shippingConfig, giftDocs),
  );
}

/** A Buy X Get Y offer the bag showed (`dealOfferIds`) that this pricing didn't apply. */
export interface MissedDeal {
  readonly missedDealOfferId: string;
  /** The offer's title, '' when the server doesn't have it. */
  readonly title: string;
  /**
   * The offer is live by the server's clock and rules (`liveOffers`: active, not archived, inside
   * its schedule, audience and code match). False when it is gone, paused, or its time is up.
   */
  readonly live: boolean;
}

/**
 * The refusal when a Buy X Get Y offer the bag showed still doesn't apply after the offers were
 * read again: the offer may still be live (only this order doesn't get it), so checkout shows the
 * message and does not leave the offer out (`details.changedOfferId`, not `endedOfferId`).
 */
export function dealChangedError(offerId: string): HttpsError {
  return new HttpsError(
    'failed-precondition',
    'Prices in your bag changed. Check your bag and place your order again.',
    { changedOfferId: offerId },
  );
}

/**
 * A bag line checkout showed cheaper per piece (`shownUnitEgp`) than the server prices it: a
 * Percent off, Amount off or Set price offer was paused, ended, lowered or narrowed, or the product
 * price went up, after the page priced the bag.
 */
export interface MissedPrice {
  readonly missedPriceProductId: string;
  /** The per-item offer checkout priced the line with, or null for none. */
  readonly shownOfferId: string | null;
  /**
   * `shownOfferId` is live by the server's clock and rules (`liveOffers`). False when it is null,
   * gone, paused, archived, or its time is up.
   */
  readonly live: boolean;
  /**
   * The server still prices the line with `shownOfferId`: the offer applies, so the product price
   * itself (or the offer's amount) changed, and checkout should read the products again.
   */
  readonly sameOffer: boolean;
  /**
   * The product's price before per-item offers went up on a line with pieces in a Buy X Get Y
   * group (those pieces pay that price): checkout should read the products again.
   */
  readonly baseRose?: boolean;
}

/**
 * The order's shipping fee or total is higher than checkout showed, while every line passed: a
 * lower price dropped the bag under the free-shipping amount, a Buy X Get Y discount shrank, a
 * piece kept its free gift instead of its discount, or a shipping rule changed.
 */
export interface MissedTotal {
  /** The server's order total (whole EGP). */
  readonly missedTotalEgp: number;
  /** The server's shipping fee (whole EGP). */
  readonly shippingEgp: number;
}

/** Something the page showed that this pricing doesn't give. */
export type PricingMiss = MissedDeal | MissedPrice | MissedTotal;

/**
 * The server's totals when its shipping fee or order total is higher than checkout showed, or
 * null. A value checkout didn't send (null, older pages) is not compared. A lower or equal server
 * amount is never a miss: the order goes through at the server's total.
 *
 * A large order whose fee is agreed later (`domestic-agreed`, fee 0 until staff set it) compares
 * only its items total (`totalEgp`) with `shownTotalEgp`, which checkout sends as the items total
 * with no shipping fee (`shownShippingEgp` null). When checkout showed a fee to be agreed (no
 * shipping fee, a total) but the server fits a box with a fee, that fee was never shown: a miss.
 */
export function missedOrderTotal(
  shown: { readonly shownShippingEgp: number | null; readonly shownTotalEgp: number | null },
  shipping: Pick<OrderShippingLine, 'kind' | 'priceEgp'>,
  totalEgp: number,
): MissedTotal | null {
  const totalHigher = shown.shownTotalEgp !== null && totalEgp > shown.shownTotalEgp;
  if (shipping.kind === 'domestic-agreed') {
    return totalHigher ? { missedTotalEgp: totalEgp, shippingEgp: shipping.priceEgp } : null;
  }
  const shownFeeToBeAgreed = shown.shownShippingEgp === null && shown.shownTotalEgp !== null;
  const shippingHigher = shownFeeToBeAgreed
    ? shipping.priceEgp > 0
    : shown.shownShippingEgp !== null && shipping.priceEgp > shown.shownShippingEgp;
  if (!shippingHigher && !totalHigher) return null;
  return { missedTotalEgp: totalEgp, shippingEgp: shipping.priceEgp };
}

/**
 * The refusal when the shipping fee or total is still higher than checkout showed after the offers
 * were read again. Same message as a line price change. The details tell checkout to read the
 * products again (`priceChanged`), give the server's clock (`nowMs`, so checkout prices offers on
 * the same clock) and the server's figures (`totalChanged`): when the same figures come back twice
 * in a row, checkout shows them in its summary, so Place Order can never fail forever.
 */
export function totalChangedError(missed: MissedTotal, nowMs: number): HttpsError {
  return new HttpsError(
    'failed-precondition',
    'Prices in your bag changed. Check your bag and place your order again.',
    {
      priceChanged: true,
      totalChanged: { shippingEgp: missed.shippingEgp, totalEgp: missed.missedTotalEgp },
      nowMs,
    },
  );
}

/** Every line's shown unit price and offer, as `priceWithOffers` compares them. */
export interface ShownLinePrice {
  readonly productId: string;
  readonly shownUnitEgp: number | null;
  readonly shownOfferId: string | null;
}

/** The server's price of one piece of a line, and the per-item offer behind it (or null). */
export interface ServerLinePrice {
  readonly unitEgp: number;
  readonly appliedOfferId: string | null;
}

/**
 * The first line the server prices higher per piece than checkout showed, or null. A line without
 * `shownUnitEgp` (an older page) is not compared. A lower or equal server price is never a miss:
 * the order goes through at the server's price.
 */
export function missedLinePrice(
  shown: readonly ShownLinePrice[],
  server: readonly ServerLinePrice[],
  liveOfferIds: ReadonlySet<string>,
): MissedPrice | null {
  for (const [index, line] of shown.entries()) {
    const priced = server[index];
    if (line.shownUnitEgp === null || priced === undefined || priced.unitEgp <= line.shownUnitEgp) continue;
    return {
      missedPriceProductId: line.productId,
      shownOfferId: line.shownOfferId,
      live: line.shownOfferId !== null && liveOfferIds.has(line.shownOfferId),
      sameOffer: line.shownOfferId !== null && priced.appliedOfferId === line.shownOfferId,
    };
  }
  return null;
}

/** A line's price before per-item offers as checkout showed it, and on the server. */
export interface BaseLinePrice {
  readonly productId: string;
  /** What checkout showed (`shownBaseEgp`), or null when it didn't send one (older pages). */
  readonly shownBaseEgp: number | null;
  /** The server's price before per-item offers. */
  readonly baseEgp: number;
  /** Pieces of the line in a Buy X Get Y group (they pay `baseEgp`). */
  readonly dealUnits: number;
}

/**
 * The first line with pieces in a Buy X Get Y group whose price before per-item offers is higher
 * than checkout showed, or null. Those pieces pay that price, so a Set price offer can't hide the
 * rise the way it hides it for `missedLinePrice`. Lines without such pieces, or without
 * `shownBaseEgp`, are not compared.
 */
export function missedBasePrice(lines: readonly BaseLinePrice[]): MissedPrice | null {
  const line = lines.find(
    (entry) => entry.dealUnits > 0 && entry.shownBaseEgp !== null && entry.baseEgp > entry.shownBaseEgp,
  );
  if (!line) return null;
  return {
    missedPriceProductId: line.productId,
    shownOfferId: null,
    live: false,
    sameOffer: false,
    baseRose: true,
  };
}

/**
 * The refusal when a line still costs more than checkout showed after the offers were read again.
 * Always "Prices in your bag changed…"; the details tell checkout what to do next:
 * `endedOfferId` when the offer it showed is no longer live on the server (checkout leaves it out
 * at once), `changedOfferId` when it is live but no longer gives that price (checkout leaves it
 * out only when the same one comes back twice in a row), and `priceChanged` when the product price
 * itself went up (no offer shown, or the shown offer still applies; checkout reads the products
 * again). A live offer that still applies sends both `priceChanged` and `changedOfferId`, so a
 * reload fixes it and checkout still can't be refused forever.
 */
export function priceChangedError(missed: MissedPrice): HttpsError {
  const productChanged = { priceChanged: true, productId: missed.missedPriceProductId };
  const details =
    missed.baseRose === true || missed.shownOfferId === null
      ? productChanged
      : !missed.live
        ? { endedOfferId: missed.shownOfferId }
        : missed.sameOffer
          ? { ...productChanged, changedOfferId: missed.shownOfferId }
          : { changedOfferId: missed.shownOfferId };
  return new HttpsError(
    'failed-precondition',
    'Prices in your bag changed. Check your bag and place your order again.',
    details,
  );
}

/**
 * Prices with the cached live offers (`getActiveOffers`, 60 seconds per server). When the page
 * showed something this pricing doesn't give (a Buy X Get Y offer that isn't applied, a line
 * that costs more per piece than checkout showed, or a shipping fee or total higher than it showed),
 * the cache may simply be behind (staff just
 * created, widened or raised the offer), so the offers are read again without the cache and the
 * order priced again. Only when it still misses is the order refused, so the order never costs
 * more than the shopper saw.
 */
export async function priceWithFreshOffersOnMiss<T>(
  loadOffers: (fresh: boolean) => Promise<readonly Offer[]>,
  price: (offers: readonly Offer[]) => Promise<T | PricingMiss>,
): Promise<T> {
  const first = await price(await loadOffers(false));
  if (!isPricingMiss(first)) return first;
  const second = await price(await loadOffers(true));
  if (!isPricingMiss(second)) return second;
  if (isMissedTotal(second)) throw totalChangedError(second, Date.now());
  throw isMissedPrice(second) ? priceChangedError(second) : missedDealError(second);
}

/**
 * The refusal for a deal that still misses after the fresh read. An offer that is no longer live
 * on the server (its time is up while the shopper's clock is behind, paused, archived, gone) is
 * refused as ended (`details.endedOfferId`), so checkout leaves it out and the shopper can order.
 * Only an offer that is live but still not applied gets `changedOfferId`.
 */
export function missedDealError(missed: MissedDeal): HttpsError {
  if (missed.live) return dealChangedError(missed.missedDealOfferId);
  return offerFullError(
    {
      offerId: missed.missedDealOfferId,
      title: missed.title,
      limits: { totalUses: null, perCustomer: null },
      kind: 'deal',
    },
    'ended',
  );
}

function isPricingMiss(value: unknown): value is PricingMiss {
  return isMissedPrice(value) || isMissedDeal(value) || isMissedTotal(value);
}

function isMissedTotal(value: unknown): value is MissedTotal {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { missedTotalEgp?: unknown }).missedTotalEgp === 'number'
  );
}

function isMissedDeal(value: unknown): value is MissedDeal {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { missedDealOfferId?: unknown }).missedDealOfferId === 'string'
  );
}

function isMissedPrice(value: unknown): value is MissedPrice {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { missedPriceProductId?: unknown }).missedPriceProductId === 'string'
  );
}

async function priceWithOffers(
  db: Firestore,
  input: CreateStoreOrderRequest,
  signedIn: boolean,
  uid: OfferCustomerKeys,
  allOffers: readonly Offer[],
  shippingConfig: ReturnType<typeof parseCheckoutShippingConfig>,
  giftDocs: ReadonlyMap<string, DocumentData | undefined>,
): Promise<PricedStoreOrder | PricingMiss> {
  const ctx: PricingContext = { now: new Date(), signedIn, codes: [] };
  // Every live offer counts, as in the bag. Checkout's `endedOfferIds` (offers of any type an
  // earlier refusal said have ended for this shopper) are left out of all pricing only when the
  // usage counts confirm they have no use left: with two Buy X Get Y offers on the same items,
  // dropping one that still has uses could let a bigger, lower-priority discount win. An offer with
  // no use left that checkout didn't leave out is refused in the order transaction
  // (`readOfferUses`) with its id, never dropped silently.
  const ended =
    input.endedOfferIds.length === 0
      ? new Set<string>()
      : await confirmedEndedOfferIds(db, uid, allOffers, input.endedOfferIds);
  const offers = ended.size === 0 ? allOffers : allOffers.filter((offer) => !ended.has(offer.id));
  const pricedLines: OrderLinePrice[] = [];
  // Paid lines with their chosen size and colour, so a Free shipping offer's Except rules apply to
  // the option picked (as item prices, Buy X Get Y and gifts do).
  const cartProducts: ShippingQuoteLine[] = [];
  let subtotalEgp = 0;
  const parcelLines: ParcelLine[] = [];

  const isInternational = input.shipping.country !== 'EG';
  const region = isInternational ? 'international' : 'egypt';
  const regionBoxes = boxesForRegion(shippingConfig.settings, region);

  const usedOffers = new Map<string, UsedOffer>();
  // Pieces the order takes from stock, by product and size: every paid line first, then gifts as
  // they're added, so a gift's stock covers the paid pieces and all gifts of the order together.
  const giftDemand = new Map<string, number>();

  const lineResults: Awaited<ReturnType<typeof priceLine>>[] = [];
  for (const line of input.lines) {
    const result = await priceLine(db, line, offers, ctx);
    lineResults.push(result);
    const key = stockDemandKey(line.productId, result.data, line.selection);
    giftDemand.set(key, (giftDemand.get(key) ?? 0) + line.quantity);
  }

  // Percent off, Amount off and Set price offers: a line that costs more per piece than checkout
  // showed (the offer was paused, ended or lowered after the page priced the bag, or this server's
  // offer cache is behind) would make the order cost more than the shopper saw:
  // `priceWithFreshOffersOnMiss` reads the offers again and refuses only if it still misses.
  const missedPrice = missedLinePrice(
    input.lines,
    lineResults.map((result) => ({ unitEgp: result.priced.unitEgp, appliedOfferId: result.appliedOfferId })),
    new Set(liveOffers(offers, ctx).map((offer) => offer.id)),
  );
  if (missedPrice !== null) return missedPrice;

  // Buy X Get Y: worked out over the whole bag with the shared engine, so the order charges what
  // the bag showed. One discount per item: a group's pieces get either the Buy X Get Y discount
  // (on the price before per-item offers) or their per-item offers, whichever saves more.
  // A piece it discounts gets no free gifts; the better deal for the shopper wins.
  const dealFacts = input.lines.map((line, index): BagLineFacts => {
    const { product, variant, priced } = lineResults[index]!;
    return {
      product,
      variant,
      quantity: line.quantity,
      basePrice: product.price,
      offerPrice: priced.unitEgp,
      onSale: product.compareAtPrice !== null && product.compareAtPrice > product.price,
      giftWorth: giftWorth(line, giftDocs),
    };
  });
  const deals = priceBagDeals(dealFacts, offers, ctx);
  // A page from before "one discount per item" (no `shownBaseEgp`) still shows Buy X Get Y on top
  // of per-item offers. Never charge it more than it showed, and never give it the double discount
  // either (any client could leave the field out): refuse and ask for a refresh, only when the
  // bag really costs more now.
  if (
    input.lines.some((line) => line.shownBaseEgp === null) &&
    costsMoreThanStacked(dealFacts, offers, ctx)
  ) {
    throw outdatedPageError();
  }
  for (const offerId of deals.offerIds) addUsedOffer(usedOffers, offers, offerId, 'deal');
  // A Buy X Get Y offer the bag showed (`dealOfferIds`) that this order doesn't get (it ended, was
  // switched off, the bag's clock was behind, or this server's offer cache is) would make the order
  // cost more than the shopper saw: `priceWithFreshOffersOnMiss` reads the offers again and refuses
  // only if it still misses.
  const missedDeal = missedDealOfferId(input.dealOfferIds, deals.offerIds);
  if (missedDeal !== null) {
    return {
      missedDealOfferId: missedDeal,
      title: offers.find((offer) => offer.id === missedDeal)?.title ?? '',
      live: liveOffers(offers, ctx).some((offer) => offer.id === missedDeal),
    };
  }
  // Pieces in a Buy X Get Y group pay the price before per-item offers: a rise there since checkout
  // priced the bag would make the order cost more than the shopper saw.
  const missedBase = missedBasePrice(
    input.lines.map((line, index) => ({
      productId: line.productId,
      shownBaseEgp: line.shownBaseEgp,
      baseEgp: Math.max(0, Math.round(lineResults[index]!.product.price)),
      dealUnits: deals.lines[index]!.dealUnits,
    })),
  );
  if (missedBase !== null) return missedBase;
  // A base price rise can also take pieces out of a group the page showed (the group now loses to
  // their per-item offers), so they pay their offer price instead: compare the whole bag with the
  // bag priced on the base prices checkout showed.
  const roseLine = baseRiseCostsMore(
    dealFacts,
    input.lines.map((line) => line.shownBaseEgp),
    offers,
    ctx,
  );
  if (roseLine !== null) {
    return {
      missedPriceProductId: input.lines[roseLine]!.productId,
      shownOfferId: null,
      live: false,
      sameOffer: false,
      baseRose: true,
    };
  }

  for (const [index, line] of input.lines.entries()) {
    const { product, variant, weightGrams } = lineResults[index]!;
    const lineDeals = deals.lines[index]!;
    const priced = withDeals(lineResults[index]!.priced, lineDeals);
    // A Percent off, Amount off or Set price offer counts once when it lowers at least one piece
    // the order pays for (pieces in a Buy X Get Y group that won pay the price before it).
    const itemOfferId = lineResults[index]!.appliedOfferId;
    if (itemOfferId !== null && lineDeals.offerUnits > 0)
      addUsedOffer(usedOffers, offers, itemOfferId, 'item');
    const forLine = pricedLines.length;
    pricedLines.push(priced);
    cartProducts.push({ product, variant });
    subtotalEgp += priced.lineDisplay;
    parcelLines.push({ weightGrams, quantity: line.quantity });

    // Free gifts: one set per piece that has no Buy X Get Y discount, price 0, listed right after
    // their line. They ship (weight) and are taken from stock on confirm like any line, but never
    // add to the subtotal.
    const giftQuantity = lineDeals.giftUnits;
    if (giftQuantity === 0) continue;
    const gifts = resolveLineGifts({
      picks: line.gifts,
      quantity: giftQuantity,
      product,
      variant,
      offers,
      ctx,
      giftDocs,
      giftDemand,
    });
    for (const gift of gifts) {
      pricedLines.push(giftOrderLine(gift, giftQuantity, forLine));
      parcelLines.push({ weightGrams: readWeightGrams(gift.data['weightGrams']), quantity: giftQuantity });
      addUsedOffer(usedOffers, offers, gift.offerId, 'gift');
    }
  }

  // Client payloads cannot choose a box. A sent boxId is not on this input.
  const plan = planDelivery(regionBoxes, region, parcelWeight(parcelLines));
  const { line: shippingLine, freeShippingOfferId } = quoteShippingLine(plan, {
    settings: shippingConfig.settings,
    region,
    isInternational,
    paymentMethod: input.paymentMethod,
    subtotalEgp,
    cartProducts,
    offers,
    ctx,
  });

  // A Free shipping offer counts only when it made the shipping free (not when the box fee, the
  // Settings promo or free-over was already as low).
  if (freeShippingOfferId !== null) addUsedOffer(usedOffers, offers, freeShippingOfferId, 'shipping');

  const totalEgp = subtotalEgp + shippingLine.priceEgp;
  // Every line passed, but the shipping fee or the total can still be higher than checkout showed
  // (a lower price dropped the bag under the free-shipping amount, a Buy X Get Y discount shrank,
  // a piece kept its free gift instead): `priceWithFreshOffersOnMiss` reads the offers again and
  // refuses only if it still misses.
  const missedTotal = missedOrderTotal(input, shippingLine, totalEgp);
  if (missedTotal !== null) return missedTotal;
  const fulfilment = resolveFulfilment(input.paymentMethod, isInternational);

  const pricing: OrderPricingSnapshot = {
    isInternational,
    shippingCountry: input.shipping.country,
    currency: 'EGP',
    rate: 1,
    markupPercent: 0,
    ratesUpdatedAt: new Date().toISOString(),
    lines: pricedLines,
    subtotalEgp,
    subtotalDisplay: subtotalEgp,
    shipping: shippingLine,
    totalDisplay: totalEgp,
    totalEgp,
    fulfilment,
  };

  return { pricing, usedOffers: Array.from(usedOffers.values()) };
}

/**
 * Adds an offer the order uses (once; the first kind seen wins). An id that isn't among `offers`
 * is skipped, and so is an offer with no limits: nothing reads its counts, and a store-wide offer
 * would otherwise make every order write the same `offerUsage` document.
 */
export function addUsedOffer(
  used: Map<string, UsedOffer>,
  offers: readonly Offer[],
  offerId: string,
  kind: UsedOfferKind,
): void {
  if (used.has(offerId)) return;
  const offer = offers.find((entry) => entry.id === offerId);
  if (!offer || (offer.limits.totalUses === null && offer.limits.perCustomer === null)) return;
  used.set(offer.id, { offerId: offer.id, title: offer.title, limits: offer.limits, kind });
}

/**
 * The index of the first line whose price before per-item offers is higher than checkout showed
 * (`shownBaseEgp`), when the bag's Buy X Get Y pricing costs more than it would on the base prices
 * checkout showed; null otherwise. Lines without `shownBaseEgp` keep the server's base price.
 */
export function baseRiseCostsMore(
  facts: readonly BagLineFacts[],
  shownBaseEgp: readonly (number | null)[],
  offers: readonly Offer[],
  ctx: PricingContext,
): number | null {
  const shownFacts = facts.map((line, index) => {
    const shown = shownBaseEgp[index];
    if (shown === null || shown === undefined || line.basePrice <= shown) return line;
    return { ...line, basePrice: shown };
  });
  const rose = shownFacts.findIndex((line, index) => line !== facts[index]);
  if (rose < 0) return null;
  const total = (lines: readonly BagLineFacts[]): number =>
    priceBagDeals(lines, offers, ctx).lines.reduce((sum, line) => sum + line.total, 0);
  return total(facts) > total(shownFacts) ? rose : null;
}

/**
 * True when the bag costs more with one discount per item than with Buy X Get Y worked out on top
 * of per-item offers (what pages from before that rule show).
 */
export function costsMoreThanStacked(
  facts: readonly BagLineFacts[],
  offers: readonly Offer[],
  ctx: PricingContext,
): boolean {
  const total = (lines: readonly BagLineFacts[]): number =>
    priceBagDeals(lines, offers, ctx).lines.reduce((sum, line) => sum + line.total, 0);
  return total(facts) > total(facts.map((line) => ({ ...line, basePrice: line.offerPrice })));
}

/**
 * The refusal for a checkout page loaded before "one discount per item": it showed Buy X Get Y
 * on top of per-item offers, so its total is lower than the order now costs. A refresh loads the
 * page that prices it the same way as the server.
 */
export function outdatedPageError(): HttpsError {
  return new HttpsError(
    'failed-precondition',
    'Prices in your bag changed. Refresh the page and place your order again.',
    { outdatedPage: true },
  );
}

/**
 * The first Buy X Get Y offer the bag showed that the order's pricing didn't apply, or null.
 * Only ever refuses an order; it never adds a discount.
 */
export function missedDealOfferId(shown: readonly string[], applied: readonly string[]): string | null {
  const got = new Set(applied);
  return shown.find((id) => !got.has(id)) ?? null;
}

/**
 * What the free gifts one piece of a bag line asks for are worth: the prices of the gift products
 * shoppers can see (published), as the bag and checkout count them; a gift product that is gone or
 * unpublished is worth 0, since it can't be given. Only used to choose between a gift and a
 * Buy X Get Y discount; the picks are checked later.
 */
export function giftWorth(
  line: Pick<OrderLineInput, 'gifts'>,
  giftDocs: ReadonlyMap<string, DocumentData | undefined>,
): number {
  let worth = 0;
  for (const pick of line.gifts) {
    const data = giftDocs.get(pick.productId);
    if (data?.['published'] !== true) continue;
    const price = Number(data['price'] ?? 0);
    if (Number.isFinite(price) && price > 0) worth += Math.round(price);
  }
  return worth;
}

/**
 * The line with its Buy X Get Y groups priced (unchanged when no piece is in one): pieces in a
 * group pay the price before per-item offers, minus the deal's discount; the others keep
 * `unitEgp` (after per-item offers).
 */
export function withDeals(priced: OrderLinePrice, lineDeals: BagLineDeals): OrderLinePrice {
  if (lineDeals.dealUnits <= 0) return priced;
  return {
    ...priced,
    lineDisplay: lineDeals.total,
    fullEgp: lineDeals.before,
    discountEgp: lineDeals.discount,
    deals: lineDeals.deals.map((deal) => ({
      offerId: deal.offerId,
      units: deal.units,
      percent: deal.percent,
      discountEgp: deal.discount,
    })),
  };
}

/** Live gift product docs by id; a missing doc maps to `undefined`. */
async function readGiftDocs(
  db: Firestore,
  ids: readonly string[],
): Promise<ReadonlyMap<string, DocumentData | undefined>> {
  const map = new Map<string, DocumentData | undefined>();
  if (ids.length === 0) return map;
  const snaps = await db.getAll(...ids.map((id) => db.collection('products').doc(id)));
  snaps.forEach((snap, index) => map.set(ids[index]!, snap.exists ? snap.data() : undefined));
  return map;
}

function giftOrderLine(gift: ResolvedGift, quantity: number, forLine: number): OrderLinePrice {
  const name = typeof gift.data['name'] === 'string' ? gift.data['name'].trim() : '';
  return {
    productId: gift.productId,
    variantId: null,
    selection: { ...gift.selection },
    quantity,
    unitEgp: 0,
    unitDisplay: 0,
    lineDisplay: 0,
    name: name || gift.gift.name,
    optionLabels: selectionLabels(gift.data, gift.selection),
    imagePath: mainImagePath(gift.data),
    gift: { offerId: gift.offerId, giftId: gift.gift.id, giftName: gift.gift.name, forLine },
  };
}

function resolveFulfilment(method: StorePaymentMethod, isInternational: boolean): OrderFulfilment {
  if (method === 'cash-on-delivery') return 'domestic-cod';
  if (method === 'instapay') return 'domestic-instapay';
  return isInternational ? 'international-paymob' : 'domestic-paymob';
}

interface ShippingLineContext {
  readonly settings: ShippingSettings;
  readonly region: ShippingRegion;
  readonly isInternational: boolean;
  readonly paymentMethod: StorePaymentMethod;
  readonly subtotalEgp: number;
  readonly cartProducts: readonly ShippingQuoteLine[];
  readonly offers: readonly Offer[];
  readonly ctx: PricingContext;
}

/**
 * The order's delivery line, plus the Free shipping offer that made it free (null when none did).
 * An Egypt order heavier than the biggest box is placed with the fee to be agreed (InstaPay or
 * Cash on Delivery only: a card can't be charged an unknown amount). Promotions and free shipping
 * don't apply to it; staff set the fee they agreed.
 */
function quoteShippingLine(
  plan: DeliveryPlan,
  c: ShippingLineContext,
): { line: OrderShippingLine; freeShippingOfferId: string | null } {
  switch (plan.kind) {
    case 'to-be-agreed':
      if (c.paymentMethod === 'paymob') {
        throw new HttpsError(
          'failed-precondition',
          "Card isn't available for large orders, because we agree the delivery fee with you first. Choose InstaPay or Cash on Delivery.",
        );
      }
      return {
        line: { kind: 'domestic-agreed', boxId: null, priceEgp: 0, priceDisplay: 0, feeAgreed: false },
        freeShippingOfferId: null,
      };
    case 'too-heavy':
      throw new HttpsError(
        'failed-precondition',
        'This order is too heavy to send abroad. Remove an item or message us.',
      );
    case 'unavailable':
      throw new HttpsError(
        'failed-precondition',
        'We could not work out delivery for this order. Please try again later.',
      );
    case 'box':
      break;
  }

  let quote;
  try {
    quote = shippingQuote(
      c.settings,
      {
        region: c.region,
        boxId: plan.box.id,
        totalWeightGrams: plan.quoteWeightGrams,
        goodsSubtotal: c.subtotalEgp,
        lines: c.cartProducts,
      },
      c.offers,
      c.ctx,
    );
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'We could not work out delivery for this bag. Please try again or contact us.',
    );
  }
  return {
    line: {
      kind: c.isInternational ? 'international-box' : 'domestic-box',
      boxId: quote.boxId,
      priceEgp: quote.fee,
      priceDisplay: quote.fee,
    },
    freeShippingOfferId: freeShippingOfferIdOf(quote),
  };
}

/**
 * The Free shipping offer that made the shipping free in this quote, or null (also when the box
 * itself already costs 0: the offer saved nothing).
 */
export function freeShippingOfferIdOf(
  quote: Pick<ShippingQuote, 'fee' | 'reason' | 'offerId'> & { readonly box: { readonly feeEgp: number } },
): string | null {
  const madeItFree = quote.reason === 'offer' && quote.fee === 0 && Math.round(quote.box.feeEgp) > 0;
  return madeItFree && quote.offerId ? quote.offerId : null;
}

async function priceLine(
  db: Firestore,
  line: OrderLineInput,
  offers: readonly Offer[],
  ctx: PricingContext,
): Promise<{
  priced: OrderLinePrice;
  product: PricedProduct;
  variant: VariantFacts | null;
  weightGrams: number | null;
  data: DocumentData;
  /** The per-item offer behind `priced.unitEgp`, or null. */
  appliedOfferId: string | null;
}> {
  const snap = await db.collection('products').doc(line.productId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'One item in your bag is no longer available.');
  }
  const data = snap.data() ?? {};
  if (data['published'] !== true) {
    throw new HttpsError('failed-precondition', 'One item in your bag is no longer available.');
  }
  assertCurrentSelection(data['options'], line.selection);
  assertRequiredSelections(data, line);
  assertLineStock(data, line);
  const product = toPricedProduct(line.productId, data);
  const variant = resolveVariantFacts(data, line);
  const unit = priceItem(product, variant, offers, ctx);
  const unitEgp = unit.effectivePrice;
  const weightGrams = readWeightGrams(data['weightGrams']);
  return {
    product,
    variant,
    weightGrams,
    data,
    appliedOfferId: unit.appliedOfferId,
    priced: {
      productId: line.productId,
      variantId: variant?.id ?? null,
      selection: { ...line.selection },
      quantity: line.quantity,
      unitEgp,
      unitDisplay: unitEgp,
      lineDisplay: unitEgp * line.quantity,
      name: product.name.trim() || 'Item',
      optionLabels: selectionLabels(data, line.selection),
      imagePath: mainImagePath(data),
    },
  };
}

/** Human labels for the chosen options, in the product's option order. */
export function selectionLabels(
  data: DocumentData,
  selection: Readonly<Record<string, string>>,
): OrderLineOptionLabel[] {
  const options = data['options'];
  if (!Array.isArray(options)) return [];
  const labels: OrderLineOptionLabel[] = [];
  for (const option of options) {
    if (!option || typeof option['key'] !== 'string') continue;
    const picked = selection[option['key']];
    if (typeof picked !== 'string') continue;
    const values = Array.isArray(option['values']) ? option['values'] : [];
    const found = values.find((val: { id?: unknown }) => val?.['id'] === picked);
    const value = found && typeof found['label'] === 'string' ? found['label'].trim() : '';
    const label = typeof option['label'] === 'string' ? option['label'].trim() : '';
    if (label && value) labels.push({ label, value });
  }
  return labels;
}

/** First gallery image path, or null. */
export function mainImagePath(data: DocumentData): string | null {
  const images = data['images'];
  if (!Array.isArray(images)) return null;
  const first = images[0];
  const path = first && typeof first['path'] === 'string' ? first['path'].trim() : '';
  return path.length > 0 ? path : null;
}

/** Product weight in grams. 0 is real (socks never add to the parcel); null = not set. */
function readWeightGrams(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < 0 || rounded > 100_000) return null;
  return rounded;
}

function assertRequiredSelections(data: DocumentData, line: OrderLineInput): void {
  const options = data['options'];
  if (!Array.isArray(options)) return;
  for (const option of options) {
    if (!option || typeof option['key'] !== 'string') continue;
    const values = option['values'];
    if (!Array.isArray(values) || values.length === 0) continue;
    const picked = line.selection[option['key']];
    if (!picked || !values.some((val) => val && val['id'] === picked)) {
      throw new HttpsError('invalid-argument', 'Choose an option for each item in your bag.');
    }
  }
}

function assertLineStock(data: DocumentData, line: OrderLineInput): void {
  if (data['inStock'] !== true) {
    throw new HttpsError('failed-precondition', 'One item in your bag is out of stock.');
  }
  const stockBySize = data['stockBySize'];
  if (isRecord(stockBySize)) {
    const sizeId = line.selection['size'];
    if (typeof sizeId !== 'string') {
      throw new HttpsError('invalid-argument', 'Choose a size for each item in your bag.');
    }
    const available = stockBySize[sizeId];
    if (typeof available !== 'number' || available < line.quantity) {
      throw new HttpsError('failed-precondition', 'One item in your bag is out of stock.');
    }
    return;
  }
  if (typeof data['stock'] === 'number' && data['stock'] < line.quantity) {
    throw new HttpsError('failed-precondition', 'One item in your bag is out of stock.');
  }
}

/**
 * Selection is the source of truth for payable pricing. Client `variantId` is
 * only accepted when it matches the variant row that selection resolves to.
 */
function resolveVariantFacts(data: DocumentData, line: OrderLineInput): VariantFacts | null {
  const variants = data['variants'];
  if (Array.isArray(variants) && variants.length > 0) {
    const matched = findVariantMatchingSelection(data, line.selection);
    if (!matched) {
      throw new HttpsError('invalid-argument', 'Choose an option for each item in your bag.');
    }
    if (line.variantId != null && line.variantId !== matched.id) {
      throw new HttpsError('invalid-argument', 'One bag item could not be priced. Refresh and try again.');
    }
    return matched;
  }
  return variantFromSelection(data, line.selection);
}

function findVariantMatchingSelection(
  data: DocumentData,
  selection: Readonly<Record<string, string>>,
): VariantFacts | null {
  const variants = data['variants'];
  if (!Array.isArray(variants)) return null;
  const match = variants.find((entry) => {
    if (!entry || typeof entry['id'] !== 'string') return false;
    const values = entry['values'];
    if (!isRecord(values)) return false;
    for (const [key, val] of Object.entries(values)) {
      if (typeof val !== 'string') return false;
      if (selection[key] !== val) return false;
    }
    return true;
  });
  if (!match || typeof match['id'] !== 'string') return null;
  const values = match['values'];
  const sizeId = isRecord(values) && typeof values['size'] === 'string' ? values['size'] : undefined;
  const colourId = isRecord(values) && typeof values['colour'] === 'string' ? values['colour'] : undefined;
  return {
    id: match['id'],
    size: optionLabel(data, 'size', sizeId),
    color: optionColor(data, 'colour', colourId),
    stock: typeof match['stock'] === 'number' ? match['stock'] : undefined,
  };
}

function variantFromSelection(
  data: DocumentData,
  selection: Readonly<Record<string, string>>,
): VariantFacts | null {
  const sizeId = selection['size'];
  const colourId = selection['colour'];
  if (!sizeId && !colourId) return null;
  return {
    id: `${sizeId ?? 'any'}-${colourId ?? 'any'}`,
    size: optionLabel(data, 'size', sizeId),
    color: optionColor(data, 'colour', colourId),
  };
}

function optionLabel(data: DocumentData, key: string, valueId: string | undefined): string | null {
  if (typeof valueId !== 'string') return null;
  const options = data['options'];
  if (!Array.isArray(options)) return null;
  for (const option of options) {
    if (!option || option['key'] !== key) continue;
    const found = option['values']?.find((val: { id?: string }) => val?.['id'] === valueId);
    if (found && typeof found['label'] === 'string') return found['label'];
  }
  return null;
}

function optionColor(data: DocumentData, key: string, valueId: string | undefined): string | null {
  if (typeof valueId !== 'string') return null;
  const options = data['options'];
  if (!Array.isArray(options)) return null;
  for (const option of options) {
    if (!option || option['key'] !== key) continue;
    const found = option['values']?.find((val: { id?: string; color?: string }) => val?.['id'] === valueId);
    if (found && typeof found['color'] === 'string') return found['color'];
  }
  return null;
}

function toPricedProduct(productId: string, data: DocumentData): PricedProduct {
  const sizes: string[] = [];
  const options = data['options'];
  if (Array.isArray(options)) {
    for (const option of options) {
      if (!option || option['key'] !== 'size') continue;
      const values = option['values'];
      if (!Array.isArray(values)) continue;
      for (const val of values) {
        const label = val?.['label'];
        if (typeof label === 'string' && label.length > 0 && !sizes.includes(label)) {
          sizes.push(label);
        }
      }
    }
  }
  return {
    productId,
    name: String(data['name'] ?? ''),
    brandId: String(data['brandId'] ?? ''),
    categoryIds: Array.isArray(data['categoryIds']) ? data['categoryIds'].map(String) : [],
    type: String(data['type'] ?? ''),
    modelGroup: typeof data['modelGroup'] === 'string' ? data['modelGroup'] : null,
    colors: Array.isArray(data['colors']) ? data['colors'].map(String) : [],
    sizes,
    tags: Array.isArray(data['tags']) ? data['tags'].map(String) : [],
    price: Math.max(0, Math.round(Number(data['price'] ?? 0))),
    compareAtPrice:
      data['compareAtPrice'] === null || data['compareAtPrice'] === undefined
        ? null
        : Math.max(0, Math.round(Number(data['compareAtPrice']))),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
