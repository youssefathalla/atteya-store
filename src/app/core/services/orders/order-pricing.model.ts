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
  /** Set on a free gift line (price 0). Gift lines follow the line they came with. */
  readonly gift?: OrderLineGift;
  /** Whole EGP a Buy X Get Y offer took off the line (`lineDisplay` is already after it). */
  readonly discountEgp?: number;
  /** The Buy X Get Y offers behind `discountEgp`. */
  readonly deals?: readonly OrderLineDeal[];
}

/** One Buy X Get Y discount on an order line, e.g. 1 piece free (`percent` 100). */
export interface OrderLineDeal {
  readonly offerId: string;
  readonly units: number;
  readonly percent: number;
  readonly discountEgp: number;
}

/** Marks an order line as a free gift of an offer, given with the line at index `forLine`. */
export interface OrderLineGift {
  readonly offerId: string;
  readonly giftId: string;
  /** The gift's name as shoppers saw it, e.g. "Free shirt". */
  readonly giftName: string;
  readonly forLine: number;
}

export interface OrderShippingLine {
  /**
   * `domestic-zone` is legacy (pre box model); new orders use `domestic-box`.
   * `domestic-agreed`: Egypt order heavier than the biggest box. The fee is 0 and the total is the
   * items only until staff set the agreed fee (`setDeliveryFee`), which sets `feeAgreed`.
   */
  readonly kind: 'domestic-zone' | 'domestic-box' | 'international-box' | 'domestic-agreed';
  /** Server-assigned parcel. Stored for admins; customers never send or see it. */
  readonly boxId: string | null;
  readonly priceEgp: number;
  readonly priceDisplay: number;
  /** Only on `domestic-agreed`: true once staff saved the fee. */
  readonly feeAgreed?: boolean;
}
