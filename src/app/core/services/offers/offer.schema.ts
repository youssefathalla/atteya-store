import * as v from 'valibot';
import { idSchema, timestampSchema } from '@shared/schemas';
import {
  DEFAULT_OFFER_BANNER,
  MAX_GIFT_CHOICES,
  MAX_GIFT_NAME,
  MAX_OFFER_GIFTS,
  bundleRows,
  parseOfferBanner,
  type OfferReward,
} from './engine';

const wholeEgp = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));
const positiveInt = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000));
const percentValue = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100));

export const OfferSetFieldSchema = v.picklist([
  'productId',
  'brandId',
  'categoryIds',
  'type',
  'modelGroup',
  'colors',
  'sizes',
  'tags',
]);

export const OfferSetAtomSchema = v.object({
  field: OfferSetFieldSchema,
  in: v.optional(v.pipe(v.array(v.string()), v.maxLength(200))),
  notIn: v.optional(v.pipe(v.array(v.string()), v.maxLength(200))),
});

export const OfferPriceAtomSchema = v.object({
  field: v.literal('price'),
  min: v.optional(wholeEgp),
  max: v.optional(wholeEgp),
});

export const OfferConditionAtomSchema = v.union([OfferSetAtomSchema, OfferPriceAtomSchema]);

export const OfferConditionGroupSchema = v.object({
  allOf: v.pipe(v.array(OfferConditionAtomSchema), v.maxLength(10)),
});

export const OfferConditionsSchema = v.object({
  anyOf: v.pipe(v.array(OfferConditionGroupSchema), v.maxLength(10)),
});

export const OfferMinimumSchema = v.object({
  subtotal: v.optional(wholeEgp),
  quantity: v.optional(positiveInt),
});

export const OfferTierSchema = v.object({
  min: positiveInt,
  percent: v.optional(percentValue),
  amount: v.optional(wholeEgp),
});

const giftId = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128));

/** One gift of a Free gift offer: a short name and the products shoppers choose from. */
export const OfferGiftSchema = v.object({
  id: giftId,
  name: v.pipe(v.string(), v.trim(), v.maxLength(MAX_GIFT_NAME)),
  productIds: v.pipe(v.array(giftId), v.maxLength(MAX_GIFT_CHOICES)),
});

const RewardVariantSchema = v.variant('kind', [
  v.object({
    kind: v.literal('percentOff'),
    percent: percentValue,
  }),
  v.object({
    kind: v.literal('amountOff'),
    amount: positiveInt,
  }),
  v.object({
    kind: v.literal('fixedPrice'),
    price: wholeEgp,
  }),
  v.object({
    kind: v.literal('tiered'),
    basis: v.picklist(['quantity', 'subtotal']),
    tiers: v.pipe(v.array(OfferTierSchema), v.minLength(2), v.maxLength(5)),
  }),
  v.object({
    kind: v.literal('buyXGetY'),
    buy: v.object({ quantity: positiveInt }),
    get: v.object({ quantity: positiveInt, percent: percentValue }),
    getConditions: v.nullable(OfferConditionsSchema, null),
    cheapestFree: v.optional(v.boolean(), true),
    repeat: v.optional(v.boolean(), true),
    maxApplications: v.nullable(positiveInt, null),
  }),
  v.object({
    kind: v.literal('bundlePrice'),
    // Bad rows are dropped by `bundleRows` below, as the server's reader does, so both price the same rows.
    rows: v.array(v.object({ quantity: v.number(), price: v.number() })),
  }),
  v.object({
    kind: v.literal('freeGift'),
    gifts: v.optional(v.pipe(v.array(OfferGiftSchema), v.maxLength(MAX_OFFER_GIFTS))),
    /** Old shape: one fixed gift product. Read as one gift with one choice. */
    giftProductId: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('freeShipping'),
  }),
]);

/**
 * The reward as the engine reads it. A Free gift offer always comes out as `gifts`; an old offer
 * holding one `giftProductId` becomes one "Free gift" with that one choice (same as `parseGifts`
 * in `functions/src/offers/offer-schema.ts`).
 */
export const OfferRewardSchema = v.pipe(
  RewardVariantSchema,
  v.transform((reward): OfferReward => {
    if (reward.kind === 'bundlePrice') return { kind: 'bundlePrice', rows: bundleRows(reward) };
    if (reward.kind !== 'freeGift') return reward;
    if (reward.gifts) {
      return {
        kind: 'freeGift',
        gifts: reward.gifts.map((gift) => ({
          id: gift.id,
          name: gift.name || 'Free gift',
          productIds: Array.from(new Set(gift.productIds)),
        })),
      };
    }
    const legacy = reward.giftProductId?.trim() ?? '';
    return {
      kind: 'freeGift',
      gifts: legacy ? [{ id: 'gift-1', name: 'Free gift', productIds: [legacy] }] : [],
    };
  }),
);

export const OfferScheduleSchema = v.object({
  startsAt: v.nullable(timestampSchema, null),
  endsAt: v.nullable(timestampSchema, null),
  timezone: v.optional(v.literal('Africa/Cairo'), 'Africa/Cairo'),
});

export const OfferLimitsSchema = v.object({
  totalUses: v.nullable(positiveInt, null),
  perCustomer: v.nullable(positiveInt, null),
});

/**
 * Top banner settings (`show`, `text`, `countdown`, `countdownDays`). Read leniently with the
 * engine's `parseOfferBanner`, the same reader Cloud Functions use: an old offer without the field,
 * or a bad value, is simply not in the banner and never drops the offer.
 */
export const OfferBannerSchema = v.pipe(
  v.optional(v.unknown(), DEFAULT_OFFER_BANNER),
  v.transform((raw) => parseOfferBanner(raw)),
);

export const OfferDocSchema = v.object({
  id: idSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  badge: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(24)), null),
  description: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(300)), null),
  active: v.boolean(),
  archived: v.optional(v.boolean(), false),
  visibility: v.optional(v.picklist(['public', 'code']), 'public'),
  audience: v.optional(v.picklist(['everyone', 'signedIn']), 'everyone'),
  schedule: OfferScheduleSchema,
  priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(-100), v.maxValue(100)), 0),
  stacking: v.optional(v.picklist(['exclusive', 'stackable']), 'stackable'),
  saleItems: v.optional(v.picklist(['bestOf', 'exclude', 'stack']), 'bestOf'),
  scope: v.optional(v.picklist(['item', 'cart']), 'item'),
  conditions: OfferConditionsSchema,
  exclude: v.optional(OfferConditionsSchema, { anyOf: [] }),
  minimum: v.nullable(OfferMinimumSchema, null),
  reward: OfferRewardSchema,
  limits: v.optional(OfferLimitsSchema, { totalUses: null, perCustomer: null }),
  requiresCode: v.optional(v.boolean(), false),
  banner: OfferBannerSchema,
  createdAt: v.optional(timestampSchema),
  updatedAt: v.optional(timestampSchema),
  updatedBy: v.optional(v.string()),
});

export const OfferCodeDocSchema = v.object({
  id: idSchema,
  code: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32)),
  codeNormalized: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32)),
});
