/**
 * Reads a stored order into the facts order emails need. Pure: no Firestore,
 * no params, so the templates and the choice of email can be unit tested.
 *
 * Every amount comes from the saved order in whole Egyptian pounds:
 * `pricing.subtotalEgp`, `pricing.shipping.priceEgp`, `pricing.totalEgp`.
 * Orders never store the shopper's display currency, so emails show EGP only.
 */
import { isDeliveryFeeToBeAgreed } from '../store/order-messages.js';

export type OrderEmailPaymentMethod = 'paymob' | 'cash-on-delivery' | 'instapay';
export type OrderEmailStatus = 'pending' | 'confirmed' | 'cancelled' | 'failed';

export interface OrderEmailLine {
  readonly productId: string;
  readonly name: string;
  readonly optionLabels: readonly { readonly label: string; readonly value: string }[];
  readonly imagePath: string | null;
  readonly quantity: number;
  readonly lineEgp: number;
}

export interface OrderEmailAddress {
  readonly fullName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string;
  readonly country: string;
  readonly phone: string;
}

export interface OrderEmailOrder {
  readonly id: string;
  /** `#A1B2C3`: the same short number the site and dashboard show. */
  readonly ref: string;
  readonly status: OrderEmailStatus;
  readonly paymentMethod: OrderEmailPaymentMethod;
  readonly customerEmail: string | null;
  readonly isInternational: boolean;
  readonly address: OrderEmailAddress;
  readonly lines: readonly OrderEmailLine[];
  readonly subtotalEgp: number;
  readonly shippingEgp: number;
  readonly totalEgp: number;
  /** Paid (Paymob) while an item had already sold out (see paymobWebhook). */
  readonly needsReview: boolean;
  /**
   * Large Egypt order whose delivery fee staff haven't set yet. `shippingEgp` is then 0 and
   * `totalEgp` is the items only; emails say the fee is to be agreed instead of showing them.
   */
  readonly feeToBeAgreed: boolean;
  /** Large Egypt order whose delivery fee staff have saved (`domestic-agreed` + `feeAgreed`). */
  readonly deliveryFeeAgreed: boolean;
  /** When staff last saved the delivery fee (`deliveryFeeSetAt`, epoch ms), or null. */
  readonly deliveryFeeSetAtMs: number | null;
}

/** `#` + first 6 characters of the order id in capitals. Keep in step with the Angular copy. */
export function shortOrderRef(orderId: string): string {
  return `#${orderId.slice(0, 6).toUpperCase()}`;
}

/** Returns null when the doc is not a store order emails can describe. */
export function readOrderForEmail(
  orderId: string,
  data: Readonly<Record<string, unknown>> | null | undefined,
): OrderEmailOrder | null {
  if (!data) return null;
  const paymentMethod = data['paymentMethod'];
  if (
    paymentMethod !== 'paymob' &&
    paymentMethod !== 'cash-on-delivery' &&
    paymentMethod !== 'instapay'
  ) {
    return null;
  }
  const status = data['status'];
  if (
    status !== 'pending' &&
    status !== 'confirmed' &&
    status !== 'cancelled' &&
    status !== 'failed'
  ) {
    return null;
  }

  const pricing = isRecord(data['pricing']) ? data['pricing'] : null;
  if (!pricing) return null;
  const rawLines = Array.isArray(pricing['lines']) ? pricing['lines'] : [];
  const lines: OrderEmailLine[] = [];
  for (const raw of rawLines) {
    if (!isRecord(raw)) continue;
    const productId = text(raw['productId']);
    const quantity = wholeNumber(raw['quantity']);
    if (!productId || quantity < 1) continue;
    const unitEgp = wholeNumber(raw['unitEgp']);
    lines.push({
      productId,
      name: text(raw['name']),
      optionLabels: readOptionLabels(raw['optionLabels']),
      imagePath: text(raw['imagePath']) || null,
      quantity,
      lineEgp: unitEgp * quantity,
    });
  }
  if (lines.length === 0) return null;

  const subtotalEgp = wholeNumber(pricing['subtotalEgp']);
  const shipping = isRecord(pricing['shipping']) ? pricing['shipping'] : null;
  const shippingEgp = shipping ? wholeNumber(shipping['priceEgp']) : 0;
  const storedTotal = pricing['totalEgp'];
  const totalEgp =
    typeof storedTotal === 'number' && Number.isFinite(storedTotal)
      ? wholeNumber(storedTotal)
      : subtotalEgp + shippingEgp;

  const shippingAddress = isRecord(data['shipping']) ? data['shipping'] : {};
  const email = text(data['customerEmail']);

  return {
    id: orderId,
    ref: shortOrderRef(orderId),
    status,
    paymentMethod,
    customerEmail: email.includes('@') ? email : null,
    isInternational: pricing['isInternational'] === true,
    address: {
      fullName: text(shippingAddress['fullName']),
      line1: text(shippingAddress['line1']),
      line2: text(shippingAddress['line2']) || null,
      city: text(shippingAddress['city']),
      region: text(shippingAddress['region']) || null,
      postalCode: text(shippingAddress['postalCode']),
      country: text(shippingAddress['country']),
      phone: text(shippingAddress['phone']),
    },
    lines,
    subtotalEgp,
    shippingEgp,
    totalEgp,
    needsReview: data['needsReview'] === true,
    feeToBeAgreed: isDeliveryFeeToBeAgreed(shipping),
    deliveryFeeAgreed: shipping?.['kind'] === 'domestic-agreed' && shipping['feeAgreed'] === true,
    deliveryFeeSetAtMs: timestampMs(data['deliveryFeeSetAt']),
  };
}

/** Firestore Timestamp (or Date / epoch ms) → epoch ms, else null. */
function timestampMs(raw: unknown): number | null {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (isRecord(raw) && typeof raw['toMillis'] === 'function') {
    const ms = (raw as { toMillis: () => unknown }).toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function readOptionLabels(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; value: string }[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const label = text(entry['label']);
    const value = text(entry['value']);
    if (label && value) out.push({ label, value });
  }
  return out;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function wholeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
