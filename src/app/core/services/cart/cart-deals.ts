import {
  freeItemWins,
  priceBagDeals,
  priceItem,
  type BagBundle,
  type BagBundleSet,
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
  /** One piece before per-item offers (the product's price; pieces in a Buy X Get Y group pay it). */
  readonly baseEgp: number;
  /**
   * The line before Buy X Get Y: pieces in a Buy X Get Y group at `baseEgp`, the others at
   * `unitEgp` (`unitEgp × quantity` when no piece is in a group).
   */
  readonly fullEgp: number;
  /** The line after Buy X Get Y. */
  readonly lineEgp: number;
  readonly deals: BagLineDeals;
  /**
   * The per-item offer that set `unitEgp`, or null. It applies only to `deals.offerUnits` pieces:
   * pieces in a Buy X Get Y group that won don't get it (one discount per item).
   */
  readonly appliedOfferId: string | null;
}

export interface PricedBagDeals {
  /** In bag order; null for a line whose product is gone or not loaded. */
  readonly lines: readonly (PricedBagLine | null)[];
  /** Buy X Get Y nudges, with `lineIndex` pointing at the bag line (not the priced subset). */
  readonly hints: readonly BagDealHint[];
  /** Bundle price offers the bag counts toward, with `lineIndex` pointing at the bag line. */
  readonly bundles: readonly BagBundle[];
  /** Bundle & Save offers the bag counts toward, with `lineIndex` pointing at the bag line. */
  readonly sets: readonly BagBundleSet[];
  /**
   * True when adding `quantity` of this product to the bag would really get it a discount from
   * the Buy X Get Y offer `offerId` (one discount per item applied), so the bag never offers a
   * free item that would cost full price.
   */
  readonly wouldDiscount: (offerId: string, product: PricedProduct, quantity: number) => boolean;
}

/**
 * Prices the bag the way the order callables do (`priceStoreOrder`): per-item offers on each
 * piece, then Buy X Get Y over the whole bag on the prices before per-item offers, each group
 * keeping whichever saves more (one discount per item). A piece a Buy X Get Y offer discounts gets no free
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
  const bases: number[] = [];
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
      basePrice: item.basePrice,
      offerPrice: unitEgp,
      onSale: compareAt !== null && compareAt > product.priced.price,
      giftWorth: lineGiftWorth(line, products),
    });
    bagIndex.push(index);
    units.push(unitEgp);
    bases.push(item.basePrice);
  });

  const deals = priceBagDeals(facts, offers, ctx);
  // Each line's `earns` points at lines of the priced subset; turn them into bag lines.
  const toBagLine = (n: number): number => bagIndex[n] ?? n;
  const priced: (PricedBagLine | null)[] = lines.map(() => null);
  deals.lines.forEach((lineDeals, n) => {
    const index = bagIndex[n]!;
    priced[index] = {
      unitEgp: units[n]!,
      baseEgp: bases[n]!,
      fullEgp: lineDeals.before,
      lineEgp: lineDeals.total,
      deals: {
        ...lineDeals,
        earns: lineDeals.earns.map((earned) => ({ ...earned, freeLines: earned.freeLines.map(toBagLine) })),
      },
      appliedOfferId: itemOffers[n] ?? null,
    };
  });
  return {
    lines: priced,
    hints: deals.hints.map((hint) => ({ ...hint, lineIndex: toBagLine(hint.lineIndex) })),
    bundles: deals.bundles.map((bundle) => ({ ...bundle, lineIndex: toBagLine(bundle.lineIndex) })),
    sets: deals.sets.map((set) => ({ ...set, lineIndex: toBagLine(set.lineIndex) })),
    wouldDiscount: (offerId, product, quantity) =>
      freeItemWins(facts, offers, ctx, offerId, extraLineFacts(product, quantity, offers, ctx)),
  };
}

/** A product not in the bag yet as one more bag line (no size chosen, no gifts). */
function extraLineFacts(
  product: PricedProduct,
  quantity: number,
  offers: readonly Offer[],
  ctx: PricingContext,
): BagLineFacts {
  const item = priceItem(product, null, offers, ctx);
  const compareAt = product.compareAtPrice;
  return {
    product,
    variant: null,
    quantity: Math.max(1, Math.floor(quantity)),
    basePrice: item.basePrice,
    offerPrice: item.effectivePrice,
    onSale: compareAt !== null && compareAt > product.price,
    giftWorth: 0,
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

/**
 * The Buy X Get Y and Bundle price offers a priced bag uses, sent with the order so the server
 * can check them.
 */
export function dealOfferIdsOf(lines: readonly (PricedBagLine | null)[]): string[] {
  const ids = new Set<string>();
  for (const line of lines) for (const deal of line?.deals.deals ?? []) ids.add(deal.offerId);
  return Array.from(ids);
}

/**
 * What checkout showed for one bag line, sent with the order (`shownUnitEgp`, `shownOfferId`,
 * `shownBaseEgp`).
 */
export interface ShownLinePrice {
  /** One piece after per-item offers, before Buy X Get Y; null when the line wasn't priced. */
  readonly shownUnitEgp: number | null;
  /** The per-item offer behind that price, or null. */
  readonly shownOfferId: string | null;
  /** One piece before per-item offers (what pieces in a Buy X Get Y group pay); null when not priced. */
  readonly shownBaseEgp: number | null;
}

/**
 * The per-piece prices and per-item offer checkout showed for each bag line (same order as the
 * bag). The server refuses the order instead of charging more than this; it never lowers a price.
 */
export function shownLinePrices(lines: readonly (PricedBagLine | null)[]): ShownLinePrice[] {
  return lines.map((line) => ({
    shownUnitEgp: line?.unitEgp ?? null,
    shownOfferId: line?.appliedOfferId ?? null,
    shownBaseEgp: line?.baseEgp ?? null,
  }));
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
