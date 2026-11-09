import { MAX_GIFT_CHOICES, MAX_GIFT_NAME, MAX_OFFER_GIFTS } from './gifts.js';
import { liveOffers } from './item-price.js';
import { matchProduct } from './match.js';
import type {
  Offer,
  OfferConditions,
  OfferDraft,
  OfferGift,
  OfferIssue,
  OfferValidationResult,
  PricedProduct,
  PricingContext,
} from './types.js';

export function validateOffer(
  draft: OfferDraft,
  products: readonly PricedProduct[],
  others: readonly Offer[],
  ctx: PricingContext,
): OfferValidationResult {
  const errors: OfferIssue[] = [];
  const warnings: OfferIssue[] = [];

  if (!draft.name.trim() || draft.name.trim().length > 80) {
    errors.push({
      code: 'name',
      message: 'Give this offer an internal name between 1 and 80 characters.',
    });
  }
  if (!draft.title.trim() || draft.title.trim().length > 60) {
    errors.push({
      code: 'title',
      message: 'Give shoppers a short title between 1 and 60 characters.',
    });
  }
  if (draft.badge && draft.badge.trim().length > 24) {
    errors.push({
      code: 'badge',
      message: 'Keep the badge under 24 characters so it fits on product cards.',
    });
  }

  validateConditionsShape(draft.conditions, 'conditions', errors);
  validateConditionsShape(draft.exclude, 'exclude', errors);

  const startsAt = draft.schedule.startsAt;
  const endsAt = draft.schedule.endsAt;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    errors.push({
      code: 'schedule.order',
      message: 'The end time must be after the start time.',
    });
  }

  if (draft.requiresCode) {
    const code = draft.code?.trim().toUpperCase() ?? '';
    if (!code) {
      errors.push({
        code: 'code.missing',
        message: 'Enter a coupon code or turn off "Requires a coupon code".',
      });
    } else {
      const duplicate = others.find(
        (other) =>
          other.id !== draft.id &&
          !other.archived &&
          other.code?.trim().toUpperCase() === code,
      );
      if (duplicate) {
        errors.push({
          code: 'code.duplicate',
          message: `Code "${code}" is already used by "${duplicate.name}".`,
        });
      }
    }
  }

  validateRewardErrors(draft, products, errors);

  // Warnings
  if (draft.conditions.anyOf.length === 0) {
    warnings.push({
      code: 'conditions.all',
      message: 'No product filters are set, so this offer applies to every product in the store.',
    });
  }

  const matchedProducts = products.filter(
    (product) => matchProduct(draft.conditions, draft.exclude, product) !== 'none',
  );
  if (products.length > 0 && matchedProducts.length === 0) {
    warnings.push({
      code: 'conditions.zero',
      message: 'No current products match these rules yet.',
    });
  }

  validateRewardWarnings(draft, matchedProducts, warnings);

  if (
    draft.saleItems === 'stack' &&
    matchedProducts.some(
      (product) => product.compareAtPrice !== null && product.compareAtPrice > product.price,
    )
  ) {
    warnings.push({
      code: 'saleItems.stack',
      message: 'Products already on sale get this discount on top of their sale price.',
    });
  }

  if (startsAt && startsAt.getTime() < ctx.now.getTime() - 60_000) {
    warnings.push({
      code: 'schedule.pastStart',
      message: 'The start time is in the past, so this offer starts as soon as it is active.',
    });
  }

  if (endsAt) {
    const remainingMs = endsAt.getTime() - ctx.now.getTime();
    if (remainingMs > 0 && remainingMs < 3600_000) {
      warnings.push({
        code: 'schedule.shortEnd',
        message: 'This offer ends in less than 1 hour.',
      });
    }
  }

  if (isCartOrDeferredReward(draft)) {
    warnings.push({
      code: 'reward.labelOnly',
      message: 'This offer shows as a label now. It will be applied in the cart once checkout is live.',
    });
  }

  const liveOthers = liveOffers(
    others.filter((other) => other.id !== draft.id),
    { now: ctx.now, signedIn: true },
  );
  for (const other of liveOthers) {
    const overlapCount = matchedProducts.filter(
      (product) => matchProduct(other.conditions, other.exclude, product) !== 'none',
    ).length;
    if (overlapCount > 0) {
      warnings.push({
        code: `overlap.${other.id}`,
        message: `${overlapCount} ${overlapCount === 1 ? 'product is' : 'products are'} also in "${other.name}". Shoppers get whichever is cheaper.`,
      });
    }
  }

  return { errors, warnings };
}

function validateConditionsShape(
  conditions: OfferConditions,
  label: string,
  errors: OfferIssue[],
): void {
  if (conditions.anyOf.length > 10) {
    errors.push({
      code: `${label}.groups`,
      message: 'Use up to 10 condition groups.',
    });
  }
  for (const group of conditions.anyOf) {
    if (group.allOf.length > 10) {
      errors.push({
        code: `${label}.atoms`,
        message: 'Each condition group can have up to 10 rules.',
      });
    }
    for (const atom of group.allOf) {
      if (atom.field !== 'price') {
        const count = (atom.in?.length ?? 0) + (atom.notIn?.length ?? 0);
        if (count > 200) {
          errors.push({
            code: `${label}.values`,
            message: 'Each rule can pick up to 200 values.',
          });
        }
      }
    }
  }
}

function validateRewardErrors(
  draft: OfferDraft,
  products: readonly PricedProduct[],
  errors: OfferIssue[],
): void {
  const r = draft.reward;
  switch (r.kind) {
    case 'percentOff':
      if (!Number.isFinite(r.percent) || r.percent < 1 || r.percent > 100) {
        errors.push({
          code: 'reward.percent',
          message: 'Enter a discount percentage between 1 and 100.',
        });
      }
      break;
    case 'amountOff':
      if (!Number.isFinite(r.amount) || r.amount < 1) {
        errors.push({
          code: 'reward.amount',
          message: 'Enter a discount amount of at least EGP 1.',
        });
      }
      break;
    case 'fixedPrice':
      if (!Number.isFinite(r.price) || r.price < 0) {
        errors.push({
          code: 'reward.fixedPrice',
          message: 'Enter a fixed price of EGP 0 or higher.',
        });
      }
      break;
    case 'tiered': {
      if (r.tiers.length < 2 || r.tiers.length > 5) {
        errors.push({
          code: 'reward.tiersCount',
          message: 'Add between 2 and 5 tiers.',
        });
      }
      let prevMin = 0;
      for (const tier of r.tiers) {
        if (!Number.isFinite(tier.min) || tier.min <= prevMin) {
          errors.push({
            code: 'reward.tiersOrder',
            message: 'Tier minimums must go up in order (for example 1, then 3).',
          });
          break;
        }
        prevMin = tier.min;
        if (
          typeof tier.percent === 'number' &&
          (tier.percent < 1 || tier.percent > 100)
        ) {
          errors.push({
            code: 'reward.tierPercent',
            message: 'Each tier percentage must be between 1 and 100.',
          });
          break;
        }
      }
      break;
    }
    case 'buyXGetY':
      if (!Number.isFinite(r.buy.quantity) || r.buy.quantity < 1) {
        errors.push({
          code: 'reward.buyQuantity',
          message: 'The "Buy" quantity must be at least 1.',
        });
      }
      if (!Number.isFinite(r.get.quantity) || r.get.quantity < 1) {
        errors.push({
          code: 'reward.getQuantity',
          message: 'The "Get" quantity must be at least 1.',
        });
      }
      if (!Number.isFinite(r.get.percent) || r.get.percent < 1 || r.get.percent > 100) {
        errors.push({
          code: 'reward.getPercent',
          message: 'The "Get" discount percentage must be between 1 and 100.',
        });
      }
      validateFreeItem(r.getConditions, errors);
      break;
    case 'freeGift':
      validateGifts(r.gifts, products, errors);
      break;
    case 'freeShipping':
      break;
  }
}

/**
 * "Which item is free?" of a Buy X get Y offer. No conditions = the cheapest item of the group.
 * Otherwise the choice must name at least one product, or at least one category or brand.
 */
function validateFreeItem(getConditions: OfferConditions | null, errors: OfferIssue[]): void {
  if (!getConditions) return;
  let products = 0;
  let categoriesOrBrands = 0;
  let wantsProducts = false;
  for (const group of getConditions.anyOf) {
    for (const atom of group.allOf) {
      if (atom.field === 'price') continue;
      const count = atom.in?.length ?? 0;
      if (atom.field === 'productId') {
        wantsProducts = true;
        products += count;
      } else if (atom.field === 'categoryIds' || atom.field === 'brandId') {
        categoriesOrBrands += count;
      }
    }
  }
  if (wantsProducts && products === 0) {
    errors.push({
      code: 'reward.freeItemProducts',
      message: 'Pick at least one product that can be the free item.',
    });
  } else if (!wantsProducts && categoriesOrBrands === 0) {
    errors.push({
      code: 'reward.freeItemGroup',
      message: 'Pick at least one category or brand for the free item.',
    });
  }
}

function validateGifts(
  gifts: readonly OfferGift[],
  products: readonly PricedProduct[],
  errors: OfferIssue[],
): void {
  if (gifts.length === 0) {
    errors.push({ code: 'reward.gifts', message: 'Add at least one gift.' });
    return;
  }
  if (gifts.length > MAX_OFFER_GIFTS) {
    errors.push({ code: 'reward.giftsCount', message: `Add up to ${MAX_OFFER_GIFTS} gifts.` });
  }
  const ids = new Set<string>();
  for (const gift of gifts) {
    if (!gift.id.trim() || ids.has(gift.id)) {
      errors.push({ code: 'reward.giftId', message: 'Each gift needs its own id. Remove the gift and add it again.' });
      break;
    }
    ids.add(gift.id);
  }
  for (const gift of gifts) {
    const name = gift.name.trim();
    if (!name || name.length > MAX_GIFT_NAME) {
      errors.push({
        code: 'reward.giftName',
        message: `Give each gift a short name between 1 and ${MAX_GIFT_NAME} characters, e.g. "Free shirt".`,
      });
      break;
    }
  }
  for (const gift of gifts) {
    if (gift.productIds.length === 0) {
      errors.push({
        code: 'reward.giftChoices',
        message: `Choose at least one product shoppers can pick for "${gift.name.trim() || 'this gift'}".`,
      });
      break;
    }
    if (gift.productIds.length > MAX_GIFT_CHOICES) {
      errors.push({
        code: 'reward.giftChoicesCount',
        message: `Each gift can offer up to ${MAX_GIFT_CHOICES} products to choose from.`,
      });
      break;
    }
  }
  if (products.length > 0) {
    const known = new Set(products.map((product) => product.productId));
    const missing = gifts.some((gift) => gift.productIds.some((id) => !known.has(id)));
    if (missing) {
      errors.push({
        code: 'reward.giftMissing',
        message: 'One of the gift products could not be found in the catalogue.',
      });
    }
  }
}

function validateRewardWarnings(
  draft: OfferDraft,
  matchedProducts: readonly PricedProduct[],
  warnings: OfferIssue[],
): void {
  const r = draft.reward;
  if (r.kind === 'percentOff' && r.percent > 60) {
    warnings.push({
      code: 'reward.highPercent',
      message: `This takes ${r.percent}% off matching products.`,
    });
  }

  if (r.kind === 'fixedPrice' && matchedProducts.length > 0) {
    const skipped = matchedProducts.filter((product) => r.price >= product.price).length;
    if (skipped > 0) {
      warnings.push({
        code: 'reward.fixedPriceHigher',
        message: `The set price is higher than or equal to the current price for ${skipped} ${skipped === 1 ? 'product, which will be' : 'products, which are'} skipped.`,
      });
    }
  }

  if (r.kind === 'amountOff' && draft.scope === 'item' && matchedProducts.length > 0) {
    const freeCount = matchedProducts.filter((product) => r.amount >= product.price).length;
    if (freeCount > 0) {
      warnings.push({
        code: 'reward.amountFree',
        message: `The discount is at least the full price for ${freeCount} ${freeCount === 1 ? 'product, which becomes' : 'products, which become'} free.`,
      });
    }
  }

  if (draft.badge) {
    const badgePercentMatch = /(\d+)\s*%/.exec(draft.badge);
    if (badgePercentMatch) {
      const promised = Number.parseInt(badgePercentMatch[1], 10);
      const maxGiven = maxOfferPercent(draft);
      if (maxGiven !== null && promised > maxGiven) {
        warnings.push({
          code: 'badge.overpromise',
          message: `The badge mentions ${promised}%, while the rule gives ${maxGiven}%.`,
        });
      }
    }
  }
}

function maxOfferPercent(draft: OfferDraft): number | null {
  const r = draft.reward;
  if (r.kind === 'percentOff') return r.percent;
  if (r.kind === 'tiered') {
    const percents = r.tiers
      .map((tier) => tier.percent)
      .filter((val): val is number => typeof val === 'number');
    return percents.length > 0 ? Math.max(...percents) : null;
  }
  if (r.kind === 'buyXGetY') return r.get.percent;
  return null;
}

function isCartOrDeferredReward(draft: OfferDraft): boolean {
  if (draft.scope === 'cart') return true;
  const kind = draft.reward.kind;
  return kind === 'buyXGetY' || kind === 'freeShipping';
}
