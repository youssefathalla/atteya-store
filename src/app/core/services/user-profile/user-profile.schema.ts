import * as v from 'valibot';
import { TimestampSchema } from '@shared/schemas/common.schema';

const text = (min: number, max: number) => v.pipe(v.string(), v.trim(), v.minLength(min), v.maxLength(max));
const optionalText = (max: number) => v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))), null);

/**
 * The one delivery address a shopper keeps in `users/{uid}.address` (Account → Delivery Address).
 * Same fields as checkout: Egypt uses full name, city, address and phone; abroad adds line 2,
 * region and postal code. Checkout fills it in when `country` matches the delivery country.
 */
export const SavedAddressSchema = v.object({
  fullName: text(1, 120),
  line1: text(1, 200),
  line2: optionalText(200),
  city: text(1, 80),
  region: optionalText(80),
  postalCode: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(20)), ''),
  country: v.pipe(v.string(), v.trim(), v.length(2)),
  phone: text(6, 20),
});

/**
 * `users/{uid}`: sign-up consent (create-once) plus the details the shopper edits on `/account`.
 * The account fields fall back to "not set" when a stored value doesn't parse, so a bad field
 * never breaks the consent check that reads this doc.
 */
export const UserProfileSchema = v.object({
  termsAcceptedAt: TimestampSchema,
  termsVersion: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  marketingOptIn: v.boolean(),
  marketingOptInAt: TimestampSchema,
  name: v.fallback(v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(120))), null), null),
  phone: v.fallback(v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(20))), null), null),
  address: v.fallback(v.optional(v.nullable(SavedAddressSchema), null), null),
});
