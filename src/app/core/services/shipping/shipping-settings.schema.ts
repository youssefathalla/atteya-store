import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas';

const fee = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));
const weightGrams = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000));
const dimCm = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300));

export const ShippingBoxIdSchema = v.picklist(['box1', 'box2', 'box3']);

export const ShippingBoxSchema = v.object({
  id: ShippingBoxIdSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  maxWeightGrams: weightGrams,
  maxLengthCm: dimCm,
  maxWidthCm: dimCm,
  maxHeightCm: dimCm,
  feeEgp: fee,
});

/** One to three boxes with different ids. A region may use fewer than three. */
const boxList = v.pipe(
  v.array(ShippingBoxSchema),
  v.minLength(1),
  v.maxLength(3),
  v.check(
    (boxes) => new Set(boxes.map((box) => box.id)).size === boxes.length,
    'Each shipping box needs a different id.',
  ),
);

/**
 * Egypt (client rates): up to 1 kg = 115 EGP, up to 3 kg = 135 EGP. Heavier orders have no box:
 * staff agree the delivery fee on WhatsApp. Keep in step with functions/src/shipping/shipping-settings.ts.
 */
export const DEFAULT_EGYPT_BOXES = [
  {
    id: 'box1' as const,
    name: 'Box 1',
    maxWeightGrams: 1_000,
    maxLengthCm: 30,
    maxWidthCm: 20,
    maxHeightCm: 10,
    feeEgp: 115,
  },
  {
    id: 'box2' as const,
    name: 'Box 2',
    maxWeightGrams: 3_000,
    maxLengthCm: 45,
    maxWidthCm: 35,
    maxHeightCm: 20,
    feeEgp: 135,
  },
];

export const DEFAULT_INTERNATIONAL_BOXES = [
  {
    id: 'box1' as const,
    name: 'Box 1',
    maxWeightGrams: 1_000,
    maxLengthCm: 30,
    maxWidthCm: 20,
    maxHeightCm: 10,
    feeEgp: 450,
  },
  {
    id: 'box2' as const,
    name: 'Box 2',
    maxWeightGrams: 5_000,
    maxLengthCm: 45,
    maxWidthCm: 35,
    maxHeightCm: 20,
    feeEgp: 750,
  },
  {
    id: 'box3' as const,
    name: 'Box 3',
    maxWeightGrams: 10_000,
    maxLengthCm: 60,
    maxWidthCm: 45,
    maxHeightCm: 35,
    feeEgp: 1_100,
  },
];

export const ShippingSettingsSchema = v.object({
  currency: v.optional(v.literal('EGP'), 'EGP'),
  egyptBoxes: v.optional(boxList, () => DEFAULT_EGYPT_BOXES.map((box) => ({ ...box }))),
  internationalBoxes: v.optional(boxList, () =>
    DEFAULT_INTERNATIONAL_BOXES.map((box) => ({ ...box })),
  ),
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
      fee: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2000)), 0),
      startsAt: v.nullable(timestampSchema, null),
      endsAt: v.nullable(timestampSchema, null),
      minSubtotal: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)), null),
      banner: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(120)), null),
    }),
    { active: false, fee: 0, startsAt: null, endsAt: null, minSubtotal: null, banner: null },
  ),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ''),
  /**
   * Legacy zone/flat fields — accepted so old Firestore docs still parse.
   * Admin save deletes them; checkout ignores them.
   */
  baseFee: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  zones: v.optional(v.array(v.unknown())),
  internationalShippingFeeEgp: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  updatedAt: v.optional(timestampSchema),
  updatedBy: v.optional(v.string()),
});

export type ShippingBoxDoc = v.InferOutput<typeof ShippingBoxSchema>;
export type ShippingSettingsDoc = v.InferOutput<typeof ShippingSettingsSchema>;
export type ShippingBoxId = v.InferOutput<typeof ShippingBoxIdSchema>;
