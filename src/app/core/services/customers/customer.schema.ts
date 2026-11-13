import * as v from 'valibot';
import { TimestampSchema } from '@shared/schemas/common.schema';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';

/** `customers` (ATS-276): one summary per email, written only by Cloud Functions. */
export const CUSTOMERS_COLLECTION = 'customers';

const count = v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0)), 0);
const money = v.fallback(v.pipe(v.number(), v.minValue(0)), 0);
const text = v.fallback(v.string(), '');
const flag = v.fallback(v.boolean(), false);
const optionalDate = v.fallback(v.nullable(TimestampSchema), null);

/**
 * `customers/{customerId}`, id = SHA-256 of the trimmed, lower-cased email. Kept up to date by
 * the customer triggers in `functions/src/customers/` from every order with that email and the
 * account (if any). Staff and admins read it; nobody writes it from the website.
 */
export const CustomerSchema = v.object({
  id: v.string(),
  email: v.string(),
  name: text,
  phone: text,
  city: text,
  country: text,
  uid: v.fallback(v.nullable(v.string()), null),
  hasAccount: flag,
  marketingOptIn: flag,
  emailVerified: flag,
  /** Every order except Payment Failed. */
  orderCount: count,
  /** Waiting for Payment. */
  openOrderCount: count,
  /** Cancelled and Payment Failed. */
  cancelledOrderCount: count,
  /** Sum of `totalEgp` of Confirmed, Shipped and Delivered orders. */
  spentEgp: money,
  /** `spentEgp` ÷ completed orders, 0 when none. */
  averageOrderEgp: money,
  firstOrderAt: optionalDate,
  lastOrderAt: optionalDate,
  createdAt: optionalDate,
  updatedAt: optionalDate,
  searchTokens: v.fallback(v.array(v.string()), []),
});

export type Customer = v.InferOutput<typeof CustomerSchema>;

/** Converter for `customers` reads (`collection(db, CUSTOMERS_COLLECTION).withConverter(...)`). */
export const customerConverter = createValibotConverter(CustomerSchema);
