/**
 * Prices are re-computed server-side at checkout from Firestore + settings, never trusted from the client.
 *
 * Paymob Egypt Accept charges whole EGP (amount_cents = totalEgp * 100).
 * Cash on delivery is Egypt shipping only.
 * `isInternational` is decided by the shipping country, not a visitor display toggle.
 * Shipping stays a separate line. Product markup is never applied to that line for Paymob/COD
 * (payable currency is always EGP at the gateway).
 */
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
  readonly totalEgp?: number;
  readonly fulfilment: 'domestic-cod' | 'domestic-paymob' | 'international-paymob';
}

export interface OrderLinePrice {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly unitEgp: number;
  readonly unitDisplay: number;
  readonly lineDisplay: number;
  readonly selection?: Readonly<Record<string, string>>;
}

export interface OrderShippingLine {
  readonly kind: 'domestic-zone' | 'international-box';
  readonly boxId: string | null;
  readonly priceEgp: number;
  readonly priceDisplay: number;
}
