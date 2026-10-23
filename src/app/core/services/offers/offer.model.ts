import type * as v from 'valibot';
import type { Offer, PricedProduct } from './engine';
import type { Product } from '@core/services/products/product.model';
import type { OfferCodeDocSchema, OfferDocSchema } from './offer.schema';

export type OfferDoc = v.InferOutput<typeof OfferDocSchema>;
export type OfferCodeDoc = v.InferOutput<typeof OfferCodeDocSchema>;

export const OFFERS_COLLECTION = 'offers';
export const OFFER_CODES_COLLECTION = 'offerCodes';
export const OFFER_USAGE_COLLECTION = 'offerUsage';

export function toEngineOffer(doc: OfferDoc, code?: string | null): Offer {
  return {
    id: doc.id,
    name: doc.name,
    title: doc.title,
    badge: doc.badge,
    description: doc.description,
    active: doc.active,
    archived: doc.archived,
    visibility: doc.visibility,
    audience: doc.audience,
    schedule: {
      startsAt: toDateOrNull(doc.schedule.startsAt),
      endsAt: toDateOrNull(doc.schedule.endsAt),
      timezone: 'Africa/Cairo',
    },
    priority: doc.priority,
    stacking: doc.stacking,
    saleItems: doc.saleItems,
    scope: doc.scope,
    conditions: doc.conditions,
    exclude: doc.exclude,
    minimum: doc.minimum,
    reward: doc.reward,
    limits: doc.limits,
    requiresCode: doc.requiresCode,
    code: code ?? null,
    updatedAtMs: toDateOrNull(doc.updatedAt)?.getTime() ?? 0,
  };
}

export function toPricedProduct(product: Product): PricedProduct {
  const sizes: string[] = [];
  for (const option of product.options) {
    if (option.key !== 'size') continue;
    for (const val of option.values) {
      if (!sizes.includes(val.label)) {
        sizes.push(val.label);
      }
    }
  }

  return {
    productId: product.id,
    name: product.name,
    brandId: product.brandId,
    categoryIds: product.categoryIds,
    type: product.type,
    modelGroup: product.modelGroup,
    colors: product.colors ?? [],
    sizes,
    tags: product.tags ?? [],
    price: product.price,
    compareAtPrice: product.compareAtPrice,
  };
}

function toDateOrNull(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object' && 'toDate' in raw && typeof raw.toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw);
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return null;
}
