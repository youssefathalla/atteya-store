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
  lines.forEach((line, index) => {
    const product = products.get(line.productId);
    if (!product) return;
    const variant = bagLineVariant(product, line);
    const unitEgp = priceItem(product.priced, variant, offers, ctx).effectivePrice;
    const compareAt = product.priced.compareAtPrice;
    facts.push({
      product: product.priced,
      variant,
      quantity: line.quantity,
      unitPrice: unitEgp,
      onSale: compareAt !== null && compareAt > product.priced.price,
      giftWorth: (line.gifts ?? []).reduce(
        (sum, gift) => sum + (products.get(gift.productId)?.priced.price ?? 0),
        0,
      ),
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
    };
  });
  return {
    lines: priced,
    hints: deals.hints.map((hint) => ({ ...hint, lineIndex: bagIndex[hint.lineIndex] ?? hint.lineIndex })),
  };
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
