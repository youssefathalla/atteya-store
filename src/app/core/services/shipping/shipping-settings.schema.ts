import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas';

const fee = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2000));

export const ShippingZoneSchema = v.object({
  id: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  fee,
  governorates: v.pipe(v.array(v.string()), v.maxLength(27)),
});

export const ShippingSettingsSchema = v.object({
  currency: v.optional(v.literal('EGP'), 'EGP'),
  baseFee: fee,
  zones: v.optional(v.pipe(v.array(ShippingZoneSchema), v.maxLength(12)), []),
  freeOver: v.optional(
    v.object({
      active: v.boolean(),
      threshold: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000))),
    }),
    { active: false, threshold: null },
  ),
  promo: v.optional(
    v.object({
      active: v.boolean(),
      fee: v.optional(fee, 0),
      startsAt: v.nullable(timestampSchema, null),
      endsAt: v.nullable(timestampSchema, null),
      minSubtotal: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)), null),
      banner: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(120)), null),
    }),
    { active: false, fee: 0, startsAt: null, endsAt: null, minSubtotal: null, banner: null },
  ),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ''),
  updatedAt: v.optional(timestampSchema),
  updatedBy: v.optional(v.string()),
});

export type ShippingSettingsDoc = v.InferOutput<typeof ShippingSettingsSchema>;
