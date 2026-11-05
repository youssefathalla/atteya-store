/**
 * Prices are re-computed server-side at checkout from Firestore + settings, never trusted from the client.
 *
 * Paymob Egypt Accept charges whole EGP (amount_cents = totalEgp * 100).
 * Cash on delivery and InstaPay are Egypt shipping only.
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
  readonly fulfilment:
    | 'domestic-cod'
    | 'domestic-instapay'
    | 'domestic-paymob'
    | 'international-paymob';
}

export interface OrderLinePrice {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly unitEgp: number;
  readonly unitDisplay: number;
  readonly lineDisplay: number;
  readonly selection?: Readonly<Record<string, string>>;
  /** Snapshot saved when the order is placed. Missing on older orders. */
  readonly name?: string;
  readonly optionLabels?: readonly { readonly label: string; readonly value: string }[];
  readonly imagePath?: string | null;
}

export interface OrderShippingLine {
  /** `domestic-zone` is legacy (pre box model); new orders use `domestic-box`. */
  readonly kind: 'domestic-zone' | 'domestic-box' | 'international-box';
  /** Server-assigned parcel. Stored for admins; customers never send or see it. */
  readonly boxId: string | null;
  readonly priceEgp: number;
  readonly priceDisplay: number;
}
