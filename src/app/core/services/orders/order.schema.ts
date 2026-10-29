import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas';

const country = v.pipe(v.string(), v.trim(), v.length(2));
const currency = v.pipe(v.string(), v.trim(), v.length(3));

export const OrderShippingSchema = v.object({
  fullName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  line1: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  line2: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)), null),
  city: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  region: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(80)), null),
  postalCode: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20)),
  country,
  phone: v.pipe(v.string(), v.trim(), v.minLength(6), v.maxLength(20)),
  governorateId: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(40)), null), null),
});

export const OrderLinePriceSchema = v.object({
  productId: v.string(),
  variantId: v.nullable(v.string(), null),
  selection: v.optional(v.record(v.string(), v.string()), {}),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  unitEgp: v.pipe(v.number(), v.integer(), v.minValue(0)),
  unitDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  lineDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
});

export const OrderShippingLineSchema = v.object({
  kind: v.picklist(['domestic-zone', 'international-box']),
  boxId: v.nullable(v.string(), null),
  priceEgp: v.pipe(v.number(), v.integer(), v.minValue(0)),
  priceDisplay: v.pipe(v.number(), v.finite(), v.minValue(0)),
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
  fulfilment: v.picklist(['domestic-cod', 'domestic-paymob', 'international-paymob']),
});

export const OrderPaymobSchema = v.object({
  intentionId: v.pipe(v.string(), v.minLength(1)),
  intentionOrderId: v.nullable(v.number(), null),
  amountCents: v.pipe(v.number(), v.integer(), v.minValue(1)),
  currency: v.literal('EGP'),
  transactionId: v.nullable(v.number(), null),
  paidAt: v.nullable(timestampSchema, null),
});

export const OrderSchema = v.object({
  id: v.string(),
  status: v.picklist(['pending', 'confirmed', 'cancelled', 'failed']),
  paymentMethod: v.picklist(['paymob', 'cash-on-delivery']),
  customerId: v.string(),
  customerEmail: v.nullable(v.string(), null),
  shipping: OrderShippingSchema,
  pricing: OrderPricingSnapshotSchema,
  paymob: v.nullable(OrderPaymobSchema, null),
  confirmedAt: v.nullable(timestampSchema, null),
  confirmedBy: v.nullable(v.string(), null),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type OrderDoc = v.InferOutput<typeof OrderSchema>;

export const ORDERS_COLLECTION = 'orders';
