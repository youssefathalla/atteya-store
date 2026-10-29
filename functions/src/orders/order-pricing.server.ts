import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { currencyFromCountry } from '../intl/currency-from-country.js';
import { readMarkupOrDefault, readStoredRates } from '../intl/exchange-rates.js';
import { getActiveOffers } from '../offers/offer-cache.js';
import {
  EGP_ENTRY,
  priceItem,
  toDisplayAmount,
  type CurrencyEntry,
  type Offer,
  type PricedProduct,
  type PricingContext,
  type VariantFacts,
} from '../offers/engine/index.js';
import {
  parsePaymentSettings,
  PAYMENTS_DOC_PATH,
  type PaymentSettings,
} from '../settings/payment-settings.js';
import type { CreateIntlBankTransferRequest, OrderLineInput } from './order-request.js';

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled';
export type OrderPaymentMethod = 'international-bank-transfer';

export interface OrderLinePrice {
  readonly productId: string;
  readonly variantId: string | null;
  readonly selection: Readonly<Record<string, string>>;
  readonly quantity: number;
  readonly unitEgp: number;
  readonly unitDisplay: number;
  readonly lineDisplay: number;
}

export interface OrderShippingLine {
  readonly kind: 'international-box';
  readonly boxId: string | null;
  readonly priceEgp: number;
  readonly priceDisplay: number;
}

export interface OrderPricingSnapshot {
  readonly isInternational: boolean;
  readonly shippingCountry: string;
  readonly currency: string;
  readonly rate: number;
  readonly markupPercent: number;
  readonly ratesUpdatedAt: string;
  readonly lines: readonly OrderLinePrice[];
  readonly subtotalEgp: number;
  readonly subtotalDisplay: number;
  readonly shipping: OrderShippingLine | null;
  readonly totalDisplay: number;
  readonly fulfilment: 'international-third-party';
}

export interface PricedOrderDraft {
  readonly pricing: OrderPricingSnapshot;
  readonly paymentSettings: PaymentSettings;
}

interface ResolvedOrderCurrency {
  readonly code: string;
  readonly productEntry: CurrencyEntry;
  readonly rawRate: number;
  readonly markupPercent: number;
}

export async function priceInternationalBankTransferOrder(
  db: Firestore,
  input: CreateIntlBankTransferRequest,
  signedIn: boolean,
): Promise<PricedOrderDraft> {
  const markupPercent = await readMarkupOrDefault(db);
  const [paymentSnap, currencySnap, ratesSnap, offers] = await Promise.all([
    db.doc(PAYMENTS_DOC_PATH).get(),
    db.doc('settings/currency').get(),
    db.doc('intlPricing/rates').get(),
    getActiveOffers(db),
  ]);
  const paymentSettings = parsePaymentSettings(paymentSnap.data());
  const currencyCode = currencyFromCountry(input.shipping.country);
  if (currencyCode === 'EGP') {
    throw new HttpsError(
      'failed-precondition',
      'Bank transfer checkout is for orders outside Egypt. Choose another payment option when it is available.',
    );
  }
  const resolved = resolveOrderCurrency(
    currencyCode,
    currencySnap.data(),
    ratesSnap.data(),
    markupPercent,
  );
  const ctx: PricingContext = { now: new Date(), signedIn, codes: [] };
  const pricedLines: OrderLinePrice[] = [];
  let subtotalEgp = 0;
  let subtotalDisplay = 0;

  for (const line of input.lines) {
    const priced = await priceLine(db, line, offers, ctx, resolved);
    pricedLines.push(priced);
    subtotalEgp += priced.unitEgp * line.quantity;
    subtotalDisplay += priced.lineDisplay;
  }

  const shippingEgp = paymentSettings.internationalShippingFeeEgp;
  const shippingEntry: CurrencyEntry = { code: resolved.code, factor: resolved.rawRate };
  const shippingDisplay = toDisplayAmount(shippingEgp, shippingEntry);
  const shipping: OrderShippingLine = {
    kind: 'international-box',
    boxId: null,
    priceEgp: shippingEgp,
    priceDisplay: shippingDisplay,
  };

  const pricing: OrderPricingSnapshot = {
    isInternational: true,
    shippingCountry: input.shipping.country,
    currency: resolved.code,
    rate: resolved.rawRate,
    markupPercent: resolved.markupPercent,
    ratesUpdatedAt: readRatesUpdatedAt(currencySnap.data()),
    lines: pricedLines,
    subtotalEgp,
    subtotalDisplay,
    shipping,
    totalDisplay: subtotalDisplay + shippingDisplay,
    fulfilment: 'international-third-party',
  };

  return { pricing, paymentSettings };
}

async function priceLine(
  db: Firestore,
  line: OrderLineInput,
  offers: readonly Offer[],
  ctx: PricingContext,
  resolved: ResolvedOrderCurrency,
): Promise<OrderLinePrice> {
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
  const unitDisplay = toDisplayAmount(unitEgp, resolved.productEntry);
  return {
    productId: line.productId,
    variantId: variant?.id ?? null,
    selection: { ...line.selection },
    quantity: line.quantity,
    unitEgp,
    unitDisplay,
    lineDisplay: unitDisplay * line.quantity,
  };
}

function resolveOrderCurrency(
  code: string,
  publicData: DocumentData | undefined,
  ratesData: DocumentData | undefined,
  markupPercent: number,
): ResolvedOrderCurrency {
  if (code === 'EGP') {
    return { code: 'EGP', productEntry: EGP_ENTRY, rawRate: 1, markupPercent: 0 };
  }
  const storedRates = readStoredRates(ratesData);
  let rawRate = storedRates?.[code];
  const publicFactor = readPublicFactor(publicData, code);
  if (!(typeof rawRate === 'number' && rawRate > 0)) {
    if (typeof publicFactor === 'number' && publicFactor > 0) {
      rawRate = publicFactor / (1 + markupPercent / 100);
    } else {
      throw new HttpsError(
        'failed-precondition',
        'We cannot quote this order in that currency right now. Try again in a moment.',
      );
    }
  }
  const productFactor =
    typeof publicFactor === 'number' && publicFactor > 0
      ? publicFactor
      : rawRate * (1 + markupPercent / 100);
  return {
    code,
    productEntry: { code, factor: productFactor },
    rawRate,
    markupPercent,
  };
}

function readPublicFactor(publicData: DocumentData | undefined, code: string): number | null {
  const currencies = publicData?.['currencies'];
  if (!isRecord(currencies)) return null;
  const entry = currencies[code];
  if (!isRecord(entry) || typeof entry['factor'] !== 'number' || !(entry['factor'] > 0)) {
    return null;
  }
  return entry['factor'];
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
  const variants = data['variants'];
  if (Array.isArray(variants) && variants.length > 0) {
    const variant = resolveVariantFacts(data, line);
    if (!variant || (typeof variant.stock === 'number' && variant.stock < line.quantity)) {
      throw new HttpsError('failed-precondition', 'One item in your bag is out of stock.');
    }
  }
}

/**
 * Selection is the source of truth for payable pricing. Client `variantId` is
 * only accepted when it matches the variant row that selection resolves to.
 * A missing/forged id must never fall through to product-level offer matching
 * when the product has variant rows or size/colour options.
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
  // Dashboard products: empty variants[]. Ignore any client variantId.
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

function readRatesUpdatedAt(currencyData: DocumentData | undefined): string {
  const raw = currencyData?.['ratesUpdatedAt'];
  if (raw && typeof raw === 'object' && 'toDate' in raw && typeof raw.toDate === 'function') {
    return raw.toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function whatsAppProofUrl(
  settings: PaymentSettings,
  transferReference: string,
  totalDisplay: number,
  currency: string,
): string | null {
  const digits = settings.whatsAppNumber.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const text = `Hi, I sent a bank transfer for order ${transferReference} (${totalDisplay} ${currency}).`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export { DEFAULT_PAYMENT_SETTINGS } from '../settings/payment-settings.js';
