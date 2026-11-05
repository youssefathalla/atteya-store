import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getActiveOffers } from '../offers/offer-cache.js';
import {
  assignShippingBox,
  boxesForRegion,
  priceItem,
  shippingQuote,
  type Offer,
  type PricedProduct,
  type PricingContext,
  type VariantFacts,
} from '../offers/engine/index.js';
import {
  parseCheckoutShippingConfig,
  SHIPPING_DOC_PATH,
} from '../shipping/shipping-settings.js';
import type {
  CreateStoreOrderRequest,
  OrderLineInput,
  StorePaymentMethod,
} from './order-request.js';

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
}

export interface OrderShippingLine {
  /** `domestic-zone` is legacy; new Egypt orders use `domestic-box`. */
  readonly kind: 'domestic-zone' | 'domestic-box' | 'international-box';
  readonly boxId: string | null;
  readonly priceEgp: number;
  readonly priceDisplay: number;
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
  const [shippingSnap, offers] = await Promise.all([
    db.doc(SHIPPING_DOC_PATH).get(),
    getActiveOffers(db),
  ]);
  const shippingConfig = parseCheckoutShippingConfig(shippingSnap.data());
  const ctx: PricingContext = { now: new Date(), signedIn, codes: [] };
  const pricedLines: OrderLinePrice[] = [];
  const cartProducts: PricedProduct[] = [];
  let subtotalEgp = 0;
  let totalWeightGrams = 0;
  let anyWeightMissing = false;

  const isInternational = input.shipping.country !== 'EG';
  const region = isInternational ? 'international' : 'egypt';
  const regionBoxes = boxesForRegion(shippingConfig.settings, region);

  for (const line of input.lines) {
    const { priced, product, weightGrams } = await priceLine(db, line, offers, ctx);
    pricedLines.push(priced);
    cartProducts.push(product);
    subtotalEgp += priced.unitEgp * line.quantity;
    if (typeof weightGrams === 'number' && weightGrams > 0) {
      totalWeightGrams += weightGrams * line.quantity;
    } else {
      anyWeightMissing = true;
    }
  }

  // Client payloads cannot choose a box. A sent boxId is not on this input.
  const selection = assignShippingBox(regionBoxes, totalWeightGrams, anyWeightMissing);
  if (!selection.ok) {
    throw boxSelectionError(selection.code);
  }

  let quote;
  try {
    quote = shippingQuote(
      shippingConfig.settings,
      {
        region,
        boxId: selection.box.id,
        // Missing weights already chose the largest box. Pass a weight that box
        // accepts so the quote cannot reject that assignment.
        totalWeightGrams: anyWeightMissing ? selection.box.maxWeightGrams : totalWeightGrams,
        goodsSubtotal: subtotalEgp,
        lines: cartProducts,
      },
      offers,
      ctx,
    );
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'We could not work out delivery for this bag. Please try again or contact us.',
    );
  }

  const shippingLine: OrderShippingLine = {
    kind: isInternational ? 'international-box' : 'domestic-box',
    boxId: quote.boxId,
    priceEgp: quote.fee,
    priceDisplay: quote.fee,
  };

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

  return { pricing };
}

function resolveFulfilment(
  method: StorePaymentMethod,
  isInternational: boolean,
): OrderFulfilment {
  if (method === 'cash-on-delivery') return 'domestic-cod';
  if (method === 'instapay') return 'domestic-instapay';
  return isInternational ? 'international-paymob' : 'domestic-paymob';
}

function boxSelectionError(code: 'too-heavy' | 'no-boxes'): HttpsError {
  if (code === 'too-heavy') {
    return new HttpsError(
      'failed-precondition',
      'This order is too heavy to deliver. Remove an item or contact us.',
    );
  }
  return new HttpsError(
    'failed-precondition',
    'We could not work out delivery for this order. Please try again later.',
  );
}

async function priceLine(
  db: Firestore,
  line: OrderLineInput,
  offers: readonly Offer[],
  ctx: PricingContext,
): Promise<{ priced: OrderLinePrice; product: PricedProduct; weightGrams: number | null }> {
  const snap = await db.collection('products').doc(line.productId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'One item in your bag is no longer available.');
  }
  const data = snap.data() ?? {};
  if (data['published'] !== true) {
    throw new HttpsError('failed-precondition', 'One item in your bag is no longer available.');
  }
  assertRequiredSelections(data, line);
  assertLineStock(data, line);
  const product = toPricedProduct(line.productId, data);
  const variant = resolveVariantFacts(data, line);
  const unit = priceItem(product, variant, offers, ctx);
  const unitEgp = unit.effectivePrice;
  const weightGrams = readWeightGrams(data['weightGrams']);
  return {
    product,
    weightGrams,
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

function readWeightGrams(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < 1 || rounded > 100_000) return null;
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
