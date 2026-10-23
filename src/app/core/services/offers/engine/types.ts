// GENERATED — edit functions/src/offers/engine
export type OfferVisibility = 'public' | 'code';
export type OfferAudience = 'everyone' | 'signedIn';
export type OfferStacking = 'exclusive' | 'stackable';
export type OfferSaleItemsPolicy = 'bestOf' | 'exclude' | 'stack';
export type OfferScope = 'item' | 'cart';

export type OfferConditionField =
  | 'productId'
  | 'brandId'
  | 'categoryIds'
  | 'type'
  | 'modelGroup'
  | 'colors'
  | 'sizes'
  | 'tags'
  | 'price';

export interface OfferSetAtom {
  readonly field: Exclude<OfferConditionField, 'price'>;
  readonly in?: readonly string[];
  readonly notIn?: readonly string[];
}

export interface OfferPriceAtom {
  readonly field: 'price';
  readonly min?: number;
  readonly max?: number;
}

export type OfferConditionAtom = OfferSetAtom | OfferPriceAtom;

export interface OfferConditionGroup {
  readonly allOf: readonly OfferConditionAtom[];
}

export interface OfferConditions {
  readonly anyOf: readonly OfferConditionGroup[];
}

export interface OfferMinimum {
  readonly subtotal?: number;
  readonly quantity?: number;
}

export interface OfferTier {
  readonly min: number;
  readonly percent?: number;
  readonly amount?: number;
}

export type OfferReward =
  | {
      readonly kind: 'percentOff';
      readonly percent: number;
    }
  | {
      readonly kind: 'amountOff';
      readonly amount: number;
    }
  | {
      readonly kind: 'fixedPrice';
      readonly price: number;
    }
  | {
      readonly kind: 'tiered';
      readonly basis: 'quantity' | 'subtotal';
      readonly tiers: readonly OfferTier[];
    }
  | {
      readonly kind: 'buyXGetY';
      readonly buy: { readonly quantity: number };
      readonly get: { readonly quantity: number; readonly percent: number };
      readonly getConditions: OfferConditions | null;
      readonly cheapestFree: boolean;
      readonly repeat: boolean;
      readonly maxApplications: number | null;
    }
  | {
      readonly kind: 'freeGift';
      readonly giftProductId: string;
      readonly giftVariantId?: string | null;
      readonly quantity: number;
    }
  | {
      readonly kind: 'freeShipping';
    };

export interface OfferSchedule {
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly timezone: 'Africa/Cairo';
}

export interface OfferLimits {
  readonly totalUses: number | null;
  readonly perCustomer: number | null;
}

export interface OfferDraft {
  readonly id?: string;
  readonly name: string;
  readonly title: string;
  readonly badge: string | null;
  readonly description: string | null;
  readonly active: boolean;
  readonly archived: boolean;
  readonly visibility: OfferVisibility;
  readonly audience: OfferAudience;
  readonly schedule: OfferSchedule;
  readonly priority: number;
  readonly stacking: OfferStacking;
  readonly saleItems: OfferSaleItemsPolicy;
  readonly scope: OfferScope;
  readonly conditions: OfferConditions;
  readonly exclude: OfferConditions;
  readonly minimum: OfferMinimum | null;
  readonly reward: OfferReward;
  readonly limits: OfferLimits;
  readonly requiresCode: boolean;
  readonly code?: string | null;
}

export interface Offer extends OfferDraft {
  readonly id: string;
  readonly updatedAtMs?: number;
}

export interface VariantFacts {
  readonly id: string;
  readonly color?: string | null;
  readonly size?: string | null;
  readonly stock?: number;
}

export interface ProductFacts {
  readonly productId: string;
  readonly brandId: string;
  readonly categoryIds: readonly string[];
  readonly type: string;
  readonly modelGroup: string | null;
  readonly colors: readonly string[];
  readonly sizes: readonly string[];
  readonly tags: readonly string[];
  readonly price: number;
  readonly variants?: readonly VariantFacts[];
}

export interface PricedProduct extends ProductFacts {
  readonly name: string;
  readonly compareAtPrice: number | null;
}

export interface PricingContext {
  readonly now: Date;
  readonly signedIn: boolean;
  readonly codes?: readonly string[];
}

export interface OfferBadge {
  readonly offerId: string;
  readonly text: string;
  readonly partial: boolean;
  readonly labelOnly: boolean;
}

export interface ItemPriceResult {
  readonly listPrice: number;
  readonly basePrice: number;
  readonly effectivePrice: number;
  readonly appliedOfferId: string | null;
  readonly discountPercent: number;
  readonly badges: readonly OfferBadge[];
}

export interface DisplayPriceResult {
  readonly fromPrice: number;
  readonly listPrice: number;
  readonly maxDiscountPercent: number;
  readonly partial: boolean;
  readonly badges: readonly OfferBadge[];
  readonly offerIds: readonly string[];
}

export interface OfferIssue {
  readonly code: string;
  readonly message: string;
}

export interface OfferValidationResult {
  readonly errors: readonly OfferIssue[];
  readonly warnings: readonly OfferIssue[];
}
