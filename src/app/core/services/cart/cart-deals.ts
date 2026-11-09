import {
  priceBagDeals,
  priceItem,
  type BagDealHint,
  type BagLineDeals,
  type BagLineFacts,
  type Offer,
  type PricedProduct,
  type PricingContext,
  type VariantFacts,
} from '@core/services/offers/engine';
import type { Product, ProductVariant } from '@core/services/products/product.model';
import { toVariantFacts } from '@core/services/products/utils/priced-product.utils';
import type { CartLineDraft } from './cart.model';

/** What bag pricing needs to know about one product. */
export interface BagPricingProduct {
  readonly priced: PricedProduct;
  readonly options: Product['options'];
  readonly variants: readonly ProductVariant[];
}

/** One bag line priced in whole EGP. */
export interface PricedBagLine {
  /** One piece after per-item offers. */
  readonly unitEgp: number;
  /** The line before Buy X Get Y (`unitEgp × quantity`). */
  readonly fullEgp: number;
  /** The line after Buy X Get Y. */
  readonly lineEgp: number;
  readonly deals: BagLineDeals;
  /** The per-item offer that set `unitEgp`, or null (shown on the bag card's offer strip). */
  readonly appliedOfferId: string | null;
}

export interface PricedBagDeals {
  /** In bag order; null for a line whose product is gone or not loaded. */
  readonly lines: readonly (PricedBagLine | null)[];
  /** Buy X Get Y nudges, with `lineIndex` pointing at the bag line (not the priced subset). */
  readonly hints: readonly BagDealHint[];
}

/**
 * Prices the bag the way the order callables do (`priceStoreOrder`): per-item offers on each
 * piece, then Buy X Get Y over the whole bag. A piece a Buy X Get Y offer discounts gets no free
 * gifts; the gift wins when it is worth more (gift worth = the gift products' prices). Lines
 * whose product is missing (`null` or not loaded) are left out. Display only: the server always
 * prices again.
 */
export function priceBag(
  lines: readonly CartLineDraft[],
  products: ReadonlyMap<string, BagPricingProduct | null | undefined>,
  offers: readonly Offer[],
  ctx: PricingContext,
): PricedBagDeals {
  const facts: BagLineFacts[] = [];
  const bagIndex: number[] = [];
  const units: number[] = [];
  const itemOffers: (string | null)[] = [];
  lines.forEach((line, index) => {
    const product = products.get(line.productId);
    if (!product) return;
    const variant = bagLineVariant(product, line);
    const item = priceItem(product.priced, variant, offers, ctx);
    const unitEgp = item.effectivePrice;
    itemOffers.push(item.appliedOfferId);
    const compareAt = product.priced.compareAtPrice;
    facts.push({
      product: product.priced,
      variant,
      quantity: line.quantity,
      unitPrice: unitEgp,
      onSale: compareAt !== null && compareAt > product.priced.price,
      giftWorth: lineGiftWorth(line, products),
    });
    bagIndex.push(index);
    units.push(unitEgp);
  });

  const deals = priceBagDeals(facts, offers, ctx);
  const priced: (PricedBagLine | null)[] = lines.map(() => null);
  deals.lines.forEach((lineDeals, n) => {
    const index = bagIndex[n]!;
    const fullEgp = units[n]! * lines[index]!.quantity;
    priced[index] = {
      unitEgp: units[n]!,
      fullEgp,
      lineEgp: Math.max(0, fullEgp - lineDeals.discount),
      deals: lineDeals,
      appliedOfferId: itemOffers[n] ?? null,
    };
  });
  return {
    lines: priced,
    hints: deals.hints.map((hint) => ({ ...hint, lineIndex: bagIndex[hint.lineIndex] ?? hint.lineIndex })),
  };
}

/**
 * What one piece's free gifts are worth, as the server counts it: the prices of the gift products
 * that can be seen (a gone or unpublished one, `null`, is worth 0). While a gift product is not
 * loaded (`undefined`, or its read failed) its worth is unknown, so the piece keeps its gifts and
 * no Buy X Get Y discount is shown on it: the bag never shows a discount the order may not give.
 */
function lineGiftWorth(
  line: CartLineDraft,
  products: ReadonlyMap<string, BagPricingProduct | null | undefined>,
): number {
  let worth = 0;
  for (const gift of line.gifts ?? []) {
    const product = products.get(gift.productId);
    if (product === undefined) return Number.POSITIVE_INFINITY;
    worth += product?.priced.price ?? 0;
  }
  return worth;
}

/** The Buy X Get Y offers a priced bag uses, sent with the order so the server can check them. */
export function dealOfferIdsOf(lines: readonly (PricedBagLine | null)[]): string[] {
  const ids = new Set<string>();
  for (const line of lines) for (const deal of line?.deals.deals ?? []) ids.add(deal.offerId);
  return Array.from(ids);
}

/**
 * The variant a bag line's choices point at, matched the way the order callables match it.
 * Null when the product has no size or colour choice, or the choices match no variant.
 */
export function bagLineVariant(
  product: Pick<BagPricingProduct, 'options' | 'variants'>,
  line: Pick<CartLineDraft, 'selection' | 'variantId'>,
): VariantFacts | null {
  if (product.variants.length > 0) {
    const matched = product.variants.find((item) =>
      Object.entries(item.values).every(([key, val]) => line.selection[key] === val),
    );
    if (!matched) return null;
    if (line.variantId != null && line.variantId !== matched.id) return null;
    return toVariantFacts(product, matched);
  }
  const sizeId = line.selection['size'];
  const colourId = line.selection['colour'];
  if (!sizeId && !colourId) return null;
  const size = optionValue(product, 'size', sizeId);
  const colour = optionValue(product, 'colour', colourId);
  return {
    id: `${sizeId ?? 'any'}-${colourId ?? 'any'}`,
    size: size?.label ?? null,
    color: colour?.color ?? null,
  };
}

/** The bag's nudge text: "Add 1 more to get 1 free" or "Add 1 more to get 1 at 50% off". */
export function dealHintText(hint: BagDealHint): string {
  if (!hint.samePool) return `${hint.title}: add the free item to your bag.`;
  const reward = hint.percent >= 100 ? `${hint.free} free` : `${hint.free} at ${hint.percent}% off`;
  return `Add ${hint.missing} more to get ${reward}`;
}

/** Heading of the bag's "choose your free item" box. */
export function dealPickTitle(hint: BagDealHint, onlyName: string | null): string {
  if (hint.percent < 100) {
    return hint.missing === 1
      ? `You've earned 1 item at ${hint.percent}% off`
      : `You've earned ${hint.missing} items at ${hint.percent}% off`;
  }
  if (hint.missing > 1) return `You've earned ${hint.missing} free items`;
  return onlyName ? `You've earned a free ${onlyName}` : "You've earned a free item";
}

function optionValue(
  product: Pick<BagPricingProduct, 'options'>,
  key: 'size' | 'colour',
  valueId: string | undefined,
): Product['options'][number]['values'][number] | undefined {
  if (!valueId) return undefined;
  return product.options.find((option) => option.key === key)?.values.find((val) => val.id === valueId);
}
