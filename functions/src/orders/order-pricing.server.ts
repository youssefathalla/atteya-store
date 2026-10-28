import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getActiveOffers } from '../offers/offer-cache.js';
import {
  EGP_ENTRY,
  isUnreliableCurrency,
  priceItem,
  toDisplayAmount,
  type CurrencyEntry,
  type Offer,
  type PricedProduct,
  type PricingContext,
  type VariantFacts,
} from '../offers/engine/index.js';
import { readMarkupOrDefault } from '../intl/exchange-rates.js';
import {
  DEFAULT_PAYMENT_SETTINGS,
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

export async function priceInternationalBankTransferOrder(
  db: Firestore,
  input: CreateIntlBankTransferRequest,
  signedIn: boolean,
): Promise<PricedOrderDraft> {
  const [paymentSnap, currencySnap, offers] = await Promise.all([
    db.doc(PAYMENTS_DOC_PATH).get(),
    db.doc('settings/currency').get(),
    getActiveOffers(db),
  ]);
  const paymentSettings = parsePaymentSettings(paymentSnap.data());
  const currencyEntry = resolveCurrencyEntry(
    input.currency,
    currencySnap.data(),
    await readMarkupOrDefault(db),
  );
  const ctx: PricingContext = { now: new Date(), signedIn, codes: [] };
  const pricedLines: OrderLinePrice[] = [];
  let subtotalEgp = 0;
  let subtotalDisplay = 0;

  for (const line of input.lines) {
    const priced = await priceLine(db, line, offers, ctx, currencyEntry);
    pricedLines.push(priced);
    subtotalEgp += priced.unitEgp * line.quantity;
    subtotalDisplay += priced.lineDisplay;
  }

  const shippingEgp = paymentSettings.internationalShippingFeeEgp;
  const shippingDisplay = toDisplayAmount(shippingEgp, currencyEntry);
  const shipping: OrderShippingLine = {
    kind: 'international-box',
    boxId: null,
    priceEgp: shippingEgp,
    priceDisplay: shippingDisplay,
  };

  const pricing: OrderPricingSnapshot = {
    isInternational: true,
    shippingCountry: input.shipping.country,
    currency: currencyEntry.code,
    rate: currencyEntry.code === 'EGP' ? 1 : readRawRate(currencySnap.data(), currencyEntry.code),
    markupPercent: currencyEntry.code === 'EGP' ? 0 : await readMarkupOrDefault(db),
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
  currencyEntry: CurrencyEntry,
): Promise<OrderLinePrice> {
  const snap = await db.collection('products').doc(line.productId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'One item in your bag is no longer available.');
  }
  const data = snap.data() ?? {};
  if (data['published'] !== true) {
    throw new HttpsError('failed-precondition', 'One item in your bag is no longer available.');
  }
  if (data['inStock'] !== true) {
    throw new HttpsError('failed-precondition', 'One item in your bag is out of stock.');
  }
  const product = toPricedProduct(line.productId, data);
  const variant = resolveVariant(data, line.variantId);
  const unit = priceItem(product, variant, offers, ctx);
  const unitEgp = unit.effectivePrice;
  const unitDisplay = toDisplayAmount(unitEgp, currencyEntry);
  return {
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
    unitEgp,
    unitDisplay,
    lineDisplay: unitDisplay * line.quantity,
  };
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

function resolveVariant(data: DocumentData, variantId: string | null): VariantFacts | null {
  if (!variantId) return null;
  const variants = data['variants'];
  if (!Array.isArray(variants)) return null;
  const match = variants.find((entry) => entry && entry['id'] === variantId);
  if (!match) return null;
  const values = match['values'];
  const sizeId = isRecord(values) ? values['size'] : undefined;
  let sizeLabel: string | null = null;
  const options = data['options'];
  if (typeof sizeId === 'string' && Array.isArray(options)) {
    for (const option of options) {
      if (!option || option['key'] !== 'size') continue;
      const optionValues = option['values'];
      if (!Array.isArray(optionValues)) continue;
      const found = optionValues.find((val) => val && val['id'] === sizeId);
      if (found && typeof found['label'] === 'string') {
        sizeLabel = found['label'];
        break;
      }
    }
  }
  return {
    id: variantId,
    size: sizeLabel,
    color: null,
    stock: typeof match['stock'] === 'number' ? match['stock'] : undefined,
  };
}

function resolveCurrencyEntry(
  requested: string,
  currencyData: DocumentData | undefined,
  markupPercent: number,
): CurrencyEntry {
  if (requested === 'EGP') return EGP_ENTRY;
  if (isUnreliableCurrency(requested)) {
    return resolveCurrencyEntry('USD', currencyData, markupPercent);
  }
  const currencies = currencyData?.['currencies'];
  if (!isRecord(currencies)) {
    throw new HttpsError(
      'failed-precondition',
      'Prices are updating. Wait a moment and try again.',
    );
  }
  const entry = currencies[requested];
  if (!isRecord(entry) || typeof entry['factor'] !== 'number' || !(entry['factor'] > 0)) {
    throw new HttpsError(
      'failed-precondition',
      'We cannot quote this order in that currency right now. Try again in a moment.',
    );
  }
  return { code: requested, factor: entry['factor'] };
}

function readRawRate(currencyData: DocumentData | undefined, code: string): number {
  const currencies = currencyData?.['currencies'];
  if (!isRecord(currencies)) return 1;
  const entry = currencies[code];
  if (!isRecord(entry) || typeof entry['factor'] !== 'number') return 1;
  return entry['factor'];
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

export { DEFAULT_PAYMENT_SETTINGS };
