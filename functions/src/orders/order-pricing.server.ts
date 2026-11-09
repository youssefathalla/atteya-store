import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getActiveOffers } from '../offers/offer-cache.js';
import {
  boxesForRegion,
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
  type ShippingRegion,
  type ShippingSettings,
  type VariantFacts,
} from '../offers/engine/index.js';
import {
  parseCheckoutShippingConfig,
  SHIPPING_DOC_PATH,
} from '../shipping/shipping-settings.js';
import type { UsedOffer } from './offer-usage.js';
import {
  giftProductIds,
  resolveLineGifts,
  stockDemandKey,
  type ResolvedGift,
} from './order-gifts.js';
import type {
  CreateStoreOrderRequest,
  OrderLineInput,
  StorePaymentMethod,
} from './order-request.js';
import { assertCurrentSelection } from './order-selection.js';

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'failed';
export type OrderPaymentMethod = StorePaymentMethod;
export type OrderFulfilment =
  | 'domestic-cod'
  | 'domestic-instapay'
  | 'domestic-paymob'
  | 'international-paymob';

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
   * Offers this order uses: Free gift offers it gives gifts from and Buy X Get Y offers that
   * discount it (each counts once towards its limits).
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
): Promise<PricedStoreOrder> {
  const [shippingSnap, offers, giftDocs] = await Promise.all([
    db.doc(SHIPPING_DOC_PATH).get(),
    getActiveOffers(db),
    readGiftDocs(db, giftProductIds(input.lines)),
  ]);
  const shippingConfig = parseCheckoutShippingConfig(shippingSnap.data());
  const ctx: PricingContext = { now: new Date(), signedIn, codes: [] };
  const pricedLines: OrderLinePrice[] = [];
  const cartProducts: PricedProduct[] = [];
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

  // Buy X Get Y: worked out over the whole bag with the shared engine, so the order charges what
  // the bag showed. A piece it discounts gets no free gifts; the better deal for the shopper wins.
  const deals = priceBagDeals(
    input.lines.map((line, index): BagLineFacts => {
      const { product, variant, priced } = lineResults[index]!;
      return {
        product,
        variant,
        quantity: line.quantity,
        unitPrice: priced.unitEgp,
        onSale: product.compareAtPrice !== null && product.compareAtPrice > product.price,
        giftWorth: giftWorth(line, giftDocs),
      };
    }),
    offers,
    ctx,
  );
  for (const offerId of deals.offerIds) {
    const offer = offers.find((entry) => entry.id === offerId);
    if (offer) usedOffers.set(offer.id, { offerId: offer.id, limits: offer.limits, kind: 'deal' });
  }

  for (const [index, line] of input.lines.entries()) {
    const { product, variant, weightGrams } = lineResults[index]!;
    const lineDeals = deals.lines[index]!;
    const priced = withDeals(lineResults[index]!.priced, lineDeals);
    const forLine = pricedLines.length;
    pricedLines.push(priced);
    cartProducts.push(product);
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
      const offer = offers.find((entry) => entry.id === gift.offerId);
      if (offer && !usedOffers.has(offer.id)) {
        usedOffers.set(offer.id, { offerId: offer.id, limits: offer.limits, kind: 'gift' });
      }
    }
  }

  // Client payloads cannot choose a box. A sent boxId is not on this input.
  const plan = planDelivery(regionBoxes, region, parcelWeight(parcelLines));
  const shippingLine = quoteShippingLine(plan, {
    settings: shippingConfig.settings,
    region,
    isInternational,
    paymentMethod: input.paymentMethod,
    subtotalEgp,
    cartProducts,
    offers,
    ctx,
  });

  const totalEgp = subtotalEgp + shippingLine.priceEgp;
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
 * What the free gifts one piece of a bag line asks for are worth: the gift products' prices.
 * Only used to choose between a gift and a Buy X Get Y discount; the picks are checked later.
 */
function giftWorth(
  line: OrderLineInput,
  giftDocs: ReadonlyMap<string, DocumentData | undefined>,
): number {
  let worth = 0;
  for (const pick of line.gifts) {
    const price = Number(giftDocs.get(pick.productId)?.['price'] ?? 0);
    if (Number.isFinite(price) && price > 0) worth += Math.round(price);
  }
  return worth;
}

/** The line with its Buy X Get Y discount taken off (unchanged when it has none). */
function withDeals(priced: OrderLinePrice, lineDeals: BagLineDeals): OrderLinePrice {
  if (lineDeals.discount <= 0) return priced;
  const lineDisplay = Math.max(0, priced.unitEgp * priced.quantity - lineDeals.discount);
  return {
    ...priced,
    lineDisplay,
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

function resolveFulfilment(
  method: StorePaymentMethod,
  isInternational: boolean,
): OrderFulfilment {
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
  readonly cartProducts: readonly PricedProduct[];
  readonly offers: readonly Offer[];
  readonly ctx: PricingContext;
}

/**
 * The order's delivery line. An Egypt order heavier than the biggest box is placed with the fee
 * to be agreed (InstaPay or Cash on Delivery only: a card can't be charged an unknown amount).
 * Promotions and free shipping don't apply to it; staff set the fee they agreed.
 */
function quoteShippingLine(plan: DeliveryPlan, c: ShippingLineContext): OrderShippingLine {
  switch (plan.kind) {
    case 'to-be-agreed':
      if (c.paymentMethod === 'paymob') {
        throw new HttpsError(
          'failed-precondition',
          "Card or Wallet isn't available for large orders, because we agree the delivery fee with you first. Choose InstaPay or Cash on Delivery.",
        );
      }
      return { kind: 'domestic-agreed', boxId: null, priceEgp: 0, priceDisplay: 0, feeAgreed: false };
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
    kind: c.isInternational ? 'international-box' : 'domestic-box',
    boxId: quote.boxId,
    priceEgp: quote.fee,
    priceDisplay: quote.fee,
  };
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
      throw new HttpsError(
        'invalid-argument',
        'One bag item could not be priced. Refresh and try again.',
      );
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
  const colourId =
    isRecord(values) && typeof values['colour'] === 'string' ? values['colour'] : undefined;
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

function optionLabel(
  data: DocumentData,
  key: string,
  valueId: string | undefined,
): string | null {
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

function optionColor(
  data: DocumentData,
  key: string,
  valueId: string | undefined,
): string | null {
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
