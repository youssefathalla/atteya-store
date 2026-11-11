import * as v from 'valibot';
import { ORDER_STATUSES } from '@core/config/order-status';
import { timestampSchema } from '@shared/schemas';

const country = v.pipe(v.string(), v.trim(), v.length(2));
const currency = v.pipe(v.string(), v.trim(), v.length(3));

export const OrderShippingSchema = v.pipe(
  v.object({
    fullName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
    line1: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    line2: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)), null),
    city: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
    region: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(80)), null),
    postalCode: v.pipe(v.string(), v.trim(), v.maxLength(20)),
    country,
    phone: v.pipe(v.string(), v.trim(), v.minLength(6), v.maxLength(20)),
    governorateId: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(40)), null), null),
    boxId: v.optional(v.nullable(v.picklist(['box1', 'box2', 'box3']), null), null),
  }),
  v.check(
    (shipping) => shipping.country === 'EG' || shipping.postalCode.length >= 1,
    'Postal code is required for international delivery.',
  ),
);

export const OrderLinePriceSchema = v.object({
  productId: v.string(),
  variantId: v.nullable(v.string(), null),
  selection: v.optional(v.record(v.string(), v.string()), {}),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  unitEgp: v.pipe(v.number(), v.integer(), v.minValue(0)),
  unitDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  lineDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  // Snapshot saved when the order is placed (missing on older orders).
  name: v.optional(v.string()),
  optionLabels: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
  imagePath: v.optional(v.nullable(v.string())),
  /** Free gift line (price 0), listed after the line it came with (`forLine`). */
  gift: v.optional(
    v.object({
      offerId: v.string(),
      giftId: v.string(),
      giftName: v.string(),
      forLine: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  ),
  /** Whole EGP a Buy X Get Y offer took off the line (`lineDisplay` is already after it). */
  discountEgp: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  /**
   * The line before its Buy X Get Y discount: pieces in a group at the price before per-item
   * offers. Only on lines with pieces in a group; missing on older orders.
   */
  fullEgp: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  deals: v.optional(
    v.array(
      v.object({
        offerId: v.string(),
        units: v.pipe(v.number(), v.integer(), v.minValue(1)),
        percent: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
        discountEgp: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    ),
  ),
});

export const OrderShippingLineSchema = v.object({
  /**
   * `domestic-zone` kept for orders placed before the box model. `domestic-agreed`: Egypt order
   * heavier than the biggest box; the fee is 0 until staff set it (`feeAgreed` true).
   */
  kind: v.picklist(['domestic-zone', 'domestic-box', 'international-box', 'domestic-agreed']),
  boxId: v.nullable(v.string(), null),
  priceEgp: v.pipe(v.number(), v.integer(), v.minValue(0)),
  priceDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  feeAgreed: v.optional(v.boolean()),
});

export const OrderPricingSnapshotSchema = v.object({
  isInternational: v.boolean(),
  shippingCountry: country,
  currency,
  rate: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  markupPercent: v.pipe(v.number(), v.finite(), v.minValue(0)),
  ratesUpdatedAt: v.string(),
  lines: v.array(OrderLinePriceSchema),
  subtotalEgp: v.pipe(v.number(), v.integer(), v.minValue(0)),
  subtotalDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  shipping: v.nullable(OrderShippingLineSchema),
  totalDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  totalEgp: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  fulfilment: v.picklist([
    'domestic-cod',
    'domestic-instapay',
    'domestic-paymob',
    'international-paymob',
    // Legacy bank-transfer fulfilment (pre-Paymob checkout).
    'international-third-party',
  ]),
});

export const OrderPaymobSchema = v.object({
  intentionId: v.pipe(v.string(), v.minLength(1)),
  intentionOrderId: v.nullable(v.number(), null),
  amountCents: v.pipe(v.number(), v.integer(), v.minValue(1)),
  currency: v.literal('EGP'),
  transactionId: v.nullable(v.number(), null),
  paidAt: v.nullable(timestampSchema, null),
});

/** Legacy international bank-transfer snapshot (read-only for admin / confirmation). */
export const OrderBankTransferSchema = v.object({
  iban: v.pipe(v.string(), v.trim(), v.minLength(15), v.maxLength(34)),
  beneficiaryName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  bankName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  whatsAppProofUrl: v.nullable(v.pipe(v.string(), v.trim(), v.minLength(8)), null),
});

/** Every status an order can have (shared list; staff move them with `setOrderStatus`). */
const orderStatus = v.picklist(ORDER_STATUSES);

/** One saved status change (`statusHistory`, appended by the server). */
export const OrderStatusChangeSchema = v.object({
  status: v.picklist(ORDER_STATUSES),
  from: v.optional(v.nullable(v.picklist(ORDER_STATUSES)), null),
  at: v.optional(v.nullable(timestampSchema), null),
  by: v.optional(v.nullable(v.string()), null),
  byEmail: v.optional(v.nullable(v.string()), null),
  reason: v.optional(v.nullable(v.string()), null),
});

export type OrderStatusChange = v.InferOutput<typeof OrderStatusChangeSchema>;

const OrderBaseFields = {
  id: v.string(),
  status: orderStatus,
  /** `null` on guest orders (placed without signing in). */
  customerId: v.nullable(v.string(), null),
  customerEmail: v.nullable(v.string(), null),
  shipping: OrderShippingSchema,
  pricing: OrderPricingSnapshotSchema,
  confirmedAt: v.nullable(timestampSchema, null),
  confirmedBy: v.nullable(v.string(), null),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};

export const StoreOrderSchema = v.object({
  ...OrderBaseFields,
  paymentMethod: v.picklist(['paymob', 'cash-on-delivery', 'instapay']),
  paymob: v.nullable(OrderPaymobSchema, null),
  /** Paid (Paymob) while an item had already sold out; staff check the order. */
  needsReview: v.optional(v.boolean(), false),
  cancelledAt: v.optional(v.nullable(timestampSchema), null),
  cancelledBy: v.optional(v.nullable(v.string()), null),
  shippedAt: v.optional(v.nullable(timestampSchema), null),
  deliveredAt: v.optional(v.nullable(timestampSchema), null),
  /** Set when the items left stock, null once they went back; missing on older orders. */
  stockDecrementedAt: v.optional(v.nullable(timestampSchema)),
  /** Staff-only note typed when cancelling (never shown to the shopper). */
  cancelReason: v.optional(v.nullable(v.string()), null),
  /** Every status change with who and when (staff-only). A bad entry drops the list, not the order. */
  statusHistory: v.optional(v.fallback(v.array(OrderStatusChangeSchema), []), []),
});

export const LegacyBankTransferOrderSchema = v.object({
  ...OrderBaseFields,
  paymentMethod: v.literal('international-bank-transfer'),
  transferReference: v.pipe(v.string(), v.minLength(8), v.maxLength(32)),
  bankTransfer: OrderBankTransferSchema,
  paymentProofPath: v.nullable(v.string(), null),
  // Soften status: legacy docs never used `failed`.
  status: orderStatus,
});

/** Accepts Paymob/COD orders and leftover bank-transfer docs so admin lists do not throw. */
export const OrderSchema = v.union([StoreOrderSchema, LegacyBankTransferOrderSchema]);

export type OrderDoc = v.InferOutput<typeof OrderSchema>;
export type StoreOrderDoc = v.InferOutput<typeof StoreOrderSchema>;

export const ORDERS_COLLECTION = 'orders';

/**
 * `orderViews/{viewKey}`: the public read-by-key copy of a guest order, written by the
 * `syncOrderView` trigger (`orderViewFields()` in `functions/src/orders/order-view.ts`). It holds
 * only what the order page reads: never the email, the uid, staff fields or the key.
 */
export const OrderViewSchema = v.object({
  id: v.string(),
  status: orderStatus,
  paymentMethod: v.picklist(['paymob', 'cash-on-delivery', 'instapay']),
  shipping: OrderShippingSchema,
  pricing: OrderPricingSnapshotSchema,
  paymob: v.optional(
    v.nullable(
      v.object({
        amountCents: v.optional(v.nullable(v.number()), null),
        paidAt: v.optional(v.nullable(timestampSchema), null),
      }),
    ),
    null,
  ),
  needsReview: v.optional(v.boolean(), false),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  confirmedAt: v.optional(v.nullable(timestampSchema), null),
  cancelledAt: v.optional(v.nullable(timestampSchema), null),
  shippedAt: v.optional(v.nullable(timestampSchema), null),
  deliveredAt: v.optional(v.nullable(timestampSchema), null),
});

export type OrderViewDoc = v.InferOutput<typeof OrderViewSchema>;

export const ORDER_VIEWS_COLLECTION = 'orderViews';

/** True for a string shaped like a guest order's view key (base64url, 43 characters). */
export function isOrderViewKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * A guest order's view → the order shape the order page reads. The fields the view leaves out
 * (owner, email, staff ids, Paymob intention ids) are empty: the page never shows them.
 */
export function orderFromView(view: OrderViewDoc): StoreOrderDoc {
  return {
    id: view.id,
    status: view.status,
    customerId: null,
    customerEmail: null,
    shipping: view.shipping,
    pricing: view.pricing,
    confirmedAt: view.confirmedAt,
    confirmedBy: null,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    paymentMethod: view.paymentMethod,
    paymob: view.paymob
      ? {
          intentionId: '',
          intentionOrderId: null,
          amountCents: view.paymob.amountCents ?? 0,
          currency: 'EGP',
          transactionId: null,
          paidAt: view.paymob.paidAt,
        }
      : null,
    needsReview: view.needsReview,
    cancelledAt: view.cancelledAt,
    cancelledBy: null,
    shippedAt: view.shippedAt,
    deliveredAt: view.deliveredAt,
    cancelReason: null,
    statusHistory: [],
  };
}
