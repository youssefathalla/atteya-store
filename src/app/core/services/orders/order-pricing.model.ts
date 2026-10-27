/**
 * Prices are re-computed server-side at checkout from Firestore + settings, never trusted from the client.
 *
 * Checkout (task 6hr3Q9Qjq62j5wWF) must follow this contract. It is not built here.
 * International orders are shipped by a third party that collects payment abroad, so there is no payment gateway.
 * The store records the order and these numbers.
 * Whether the third party collects the display amount or the EGP amount is an open client question.
 * `isInternational` is decided by the shipping country, not the currency the visitor picked in the header.
 * A visitor outside Egypt can switch the display to EGP and see Egypt prices. Checkout still reprices from the shipping country.
 * Shipping stays a separate line. Product markup is never applied to that line.
 */
export interface OrderPricingSnapshot {
  readonly isInternational: boolean; // decided by SHIPPING country, not the display currency
  readonly shippingCountry: string; // ISO 3166-1 alpha-2, 'EG' for domestic
  readonly currency: string; // display currency charged/quoted, 'EGP' for domestic
  readonly rate: number; // 1 EGP = rate (raw market rate at order time); 1 for EGP
  readonly markupPercent: number; // admin-only field; 0 for domestic. Never shown to the customer
  readonly ratesUpdatedAt: string; // ISO time of the rates used
  readonly lines: readonly OrderLinePrice[];
  readonly subtotalEgp: number; // sum of lines, base EGP before markup
  readonly subtotalDisplay: number; // sum of lines in display currency (after markup + rounding)
  readonly shipping: OrderShippingLine | null; // SEPARATE line, never folded into product prices
  readonly totalDisplay: number; // subtotalDisplay + shipping.priceDisplay
  readonly fulfilment: 'domestic-cod' | 'international-third-party';
}

export interface OrderLinePrice {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly unitEgp: number; // after offers, before markup
  readonly unitDisplay: number; // toDisplayAmount(unitEgp, entry)
  readonly lineDisplay: number; // unitDisplay * quantity
}

export interface OrderShippingLine {
  readonly kind: 'domestic-zone' | 'international-box';
  readonly boxId: string | null; // international only (boxes task)
  readonly priceEgp: number; // as set by the client
  readonly priceDisplay: number; // converted, NO product markup applied
}
