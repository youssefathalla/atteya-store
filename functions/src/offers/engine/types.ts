export type OfferVisibility = 'public' | 'code';
export type OfferAudience = 'everyone' | 'signedIn';
export type OfferStacking = 'exclusive' | 'stackable';
export type OfferSaleItemsPolicy = 'bestOf' | 'exclude' | 'stack';
export type OfferScope = 'item' | 'cart';

export type OfferConditionField =
  'productId' | 'brandId' | 'categoryIds' | 'type' | 'modelGroup' | 'colors' | 'sizes' | 'tags' | 'price';

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
      /**
       * Bundle price: a whole-EGP total per number of pieces ("2 for 200", "3 for 275"). Any mix of
       * the offer's products counts; rows repeat, and the bag uses the cheapest mix for the shopper.
       */
      readonly kind: 'bundlePrice';
      readonly rows: readonly OfferBundleRow[];
    }
  | {
      /**
       * Bundle & Save: 2 to 4 groups of products (`slots`), each with how many pieces; one piece
       * set from every group gets `setReward`. Sets repeat, up to `maxSets` (null = no cap).
       */
      readonly kind: 'bundleSet';
      readonly slots: readonly OfferBundleSlot[];
      readonly setReward: OfferBundleSetReward;
      readonly maxSets: number | null;
    }
  | {
      readonly kind: 'freeGift';
      /**
       * One set of these gifts per qualifying item bought. The shopper picks one product from
       * each gift's `productIds` (and its size when it has sizes). An old offer that held one
       * fixed `giftProductId` is read as one gift with one choice.
       */
      readonly gifts: readonly OfferGift[];
    }
  | {
      readonly kind: 'freeShipping';
    };

/** One row of a Bundle price offer: `quantity` pieces for `price` whole EGP in total. */
export interface OfferBundleRow {
  readonly quantity: number;
  readonly price: number;
}

/** One group of a Bundle & Save offer, e.g. "T-shirt" × 1 from the T-shirts category. */
export interface OfferBundleSlot {
  /** Stable id inside the offer (`slot-1`, …). */
  readonly id: string;
  /** Short name shoppers see, e.g. "T-shirt". */
  readonly name: string;
  /** Pieces of this group in one set: 1 to 5. */
  readonly quantity: number;
  /** Which products count for this group (exact products, a category or a brand). */
  readonly conditions: OfferConditions;
}

/**
 * What one complete Bundle & Save set gets: a whole-EGP total for the set, a percent or an EGP
 * amount off the set, or the cheapest piece of the set free.
 */
export type OfferBundleSetReward =
  | { readonly type: 'total'; readonly price: number }
  | { readonly type: 'percent'; readonly percent: number }
  | { readonly type: 'amount'; readonly amount: number }
  | { readonly type: 'cheapestFree' };

/** One free gift of a Free gift offer, e.g. "Free shirt" with 4 shirts to choose from. */
export interface OfferGift {
  /** Stable id inside the offer (`gift-1`, …); bag lines and orders point at it. */
  readonly id: string;
  /** Short name shoppers see, e.g. "Free shirt". */
  readonly name: string;
  /** Products the shopper can choose from. */
  readonly productIds: readonly string[];
}

export interface OfferSchedule {
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly timezone: 'Africa/Cairo';
}

export interface OfferLimits {
  readonly totalUses: number | null;
  readonly perCustomer: number | null;
}

/** When the top banner shows the time left: never, always, or only in the last `countdownDays` days. */
export type OfferBannerCountdown = 'hide' | 'always' | 'lastDays';

/** How an offer shows in the storefront's top announcement bar. */
export interface OfferBanner {
  /** Staff turned the offer on in the top banner (offers for everyone only). */
  readonly show: boolean;
  /** Banner text, at most 60 characters; null = the offer's customer title. */
  readonly text: string | null;
  readonly countdown: OfferBannerCountdown;
  /** Used when `countdown` is `lastDays`: 1 to 30, default 7. */
  readonly countdownDays: number;
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
  /** Top banner settings; missing (older offers) = not in the banner. */
  readonly banner?: OfferBanner;
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
