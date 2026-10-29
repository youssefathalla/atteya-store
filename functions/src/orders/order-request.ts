import { HttpsError } from 'firebase-functions/v2/https';
import { EGYPT_GOVERNORATES } from '../offers/engine/governorates.js';
import type { ShippingBoxId } from '../offers/engine/shipping.js';
import { SHIPPING_BOX_IDS } from '../offers/engine/shipping.js';

const COUNTRY_CODE = /^[A-Z]{2}$/;
const MAX_LINES = 20;
const MAX_QTY = 20;
const MAX_NAME = 120;
const MAX_LINE = 200;
const MAX_CITY = 80;
const MAX_POSTAL = 20;
const MAX_PHONE = 20;
const MAX_SELECTION_KEYS = 8;
const EGYPT_GOVERNORATE_IDS = new Set(EGYPT_GOVERNORATES.map((g) => g.id));
const BOX_IDS = new Set<string>(SHIPPING_BOX_IDS);

export type StorePaymentMethod = 'paymob' | 'cash-on-delivery';

export interface OrderLineInput {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly selection: Readonly<Record<string, string>>;
}

export interface OrderShippingInput {
  readonly fullName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string;
  readonly country: string;
  readonly phone: string;
  /** Egypt governorate id (cairo, alexandria, …). Required for EG address. */
  readonly governorateId: string | null;
  /** Chosen parcel box (`box1`–`box3`). Null lets the server auto-select. */
  readonly boxId: ShippingBoxId | null;
}

export interface CreateStoreOrderRequest {
  readonly lines: readonly OrderLineInput[];
  readonly shipping: OrderShippingInput;
  readonly paymentMethod: StorePaymentMethod;
}

export function parseCreateStoreOrderRequest(data: unknown): CreateStoreOrderRequest {
  if (!isRecord(data)) {
    throw new HttpsError('invalid-argument', 'Your order could not be read. Refresh and try again.');
  }
  const lines = parseLines(data['lines']);
  const shipping = parseShipping(data['shipping']);
  const paymentMethod = parsePaymentMethod(data['paymentMethod'], shipping.country);
  return { lines, shipping, paymentMethod };
}

function parsePaymentMethod(raw: unknown, country: string): StorePaymentMethod {
  if (raw !== 'paymob' && raw !== 'cash-on-delivery') {
    throw new HttpsError('invalid-argument', 'Choose how you want to pay.');
  }
  if (raw === 'cash-on-delivery' && country !== 'EG') {
    throw new HttpsError(
      'failed-precondition',
      'Cash on delivery is only available for orders delivered in Egypt.',
    );
  }
  return raw;
}

function parseLines(raw: unknown): OrderLineInput[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES) {
    throw new HttpsError('invalid-argument', 'Add at least one item to your bag before checking out.');
  }
  const lines: OrderLineInput[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      throw new HttpsError('invalid-argument', 'One bag item could not be read. Refresh and try again.');
    }
    const productId = readId(entry['productId']);
    const variantId = readOptionalId(entry['variantId']);
    const quantity = readQuantity(entry['quantity']);
    const selection = parseSelection(entry['selection']);
    lines.push({ productId, variantId, quantity, selection });
  }
  return lines;
}

function parseSelection(raw: unknown): Readonly<Record<string, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (count >= MAX_SELECTION_KEYS) break;
    if (typeof key !== 'string' || key.length === 0 || key.length > 40) continue;
    if (typeof value !== 'string' || value.length === 0 || value.length > 80) continue;
    out[key] = value;
    count++;
  }
  return out;
}

function parseShipping(raw: unknown): OrderShippingInput {
  if (!isRecord(raw)) {
    throw new HttpsError('invalid-argument', 'Enter your delivery address to continue.');
  }
  const fullName = readText(raw['fullName'], MAX_NAME, 'Enter the recipient name.');
  const line1 = readText(raw['line1'], MAX_LINE, 'Enter the street address.');
  const line2 = readOptionalText(raw['line2'], MAX_LINE);
  const city = readText(raw['city'], MAX_CITY, 'Enter the city.');
  const region = readOptionalText(raw['region'], MAX_CITY);
  const postalCode = readText(raw['postalCode'], MAX_POSTAL, 'Enter the postal code.');
  const country = readCountry(raw['country']);
  const phone = readText(raw['phone'], MAX_PHONE, 'Enter a phone number we can reach you on.');
  const governorateId = readGovernorate(raw['governorateId'], country);
  const boxId = readBoxId(raw['boxId']);
  return {
    fullName,
    line1,
    line2,
    city,
    region,
    postalCode,
    country,
    phone,
    governorateId,
    boxId,
  };
}

function readBoxId(raw: unknown): ShippingBoxId | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !BOX_IDS.has(raw)) {
    throw new HttpsError('invalid-argument', 'Choose a delivery box to continue.');
  }
  return raw as ShippingBoxId;
}

function readGovernorate(raw: unknown, country: string): string | null {
  if (country !== 'EG') return null;
  if (raw === null || raw === undefined || raw === '') {
    throw new HttpsError('invalid-argument', 'Choose your governorate for Egypt delivery.');
  }
  if (typeof raw !== 'string') {
    throw new HttpsError('invalid-argument', 'Choose your governorate for Egypt delivery.');
  }
  const trimmed = raw.trim().toLowerCase();
  if (!EGYPT_GOVERNORATE_IDS.has(trimmed)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Egypt governorate.');
  }
  return trimmed;
}

function readCountry(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HttpsError('invalid-argument', 'Choose a delivery country.');
  }
  const code = raw.trim().toUpperCase();
  if (!COUNTRY_CODE.test(code)) {
    throw new HttpsError('invalid-argument', 'Choose a valid delivery country.');
  }
  return code;
}

function readId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 80) {
    throw new HttpsError('invalid-argument', 'One bag item could not be read. Refresh and try again.');
  }
  return raw;
}

function readOptionalId(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return readId(raw);
}

function readQuantity(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_QTY) {
    throw new HttpsError('invalid-argument', 'Choose a quantity between 1 and 20 for each item.');
  }
  return raw;
}

function readText(raw: unknown, max: number, message: string): string {
  if (typeof raw !== 'string') throw new HttpsError('invalid-argument', message);
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > max) {
    throw new HttpsError('invalid-argument', message);
  }
  return trimmed;
}

function readOptionalText(raw: unknown, max: number): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) return null;
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
