import type { GiftChoiceView } from '@core/services/cart/cart-gifts';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import {
  bundleRows,
  liveOffers,
  matchProduct,
  type Offer,
  type OfferBundleRow,
  type PricingContext,
  type ProductFacts,
} from '@core/services/offers/engine';
import type { Product } from '@core/services/products';
import type { ChoicePrompt } from '../models/product-page.model';
import { findVariant } from './product-stock.utils';

/** The Bundle price offer on this product: its id and its rows ("1 for 125", "2 for 200"). */
export interface ProductBundleOffer {
  readonly offer: Offer;
  readonly rows: readonly OfferBundleRow[];
}

/** One product a piece can be: its card, plus the product itself for building the bag line. */
export interface BundleChoice {
  readonly view: GiftChoiceView;
  readonly product: Product;
}

/** What the shopper picked for one piece. `sizeId` is null until a size is chosen (or there is none). */
export interface BundlePick {
  readonly productId: string;
  readonly sizeId: string | null;
}

/** Piece index (0 = Piece 1) -> pick. A missing entry is a piece still open. */
export type BundlePicks = Readonly<Record<number, BundlePick>>;

/** One numbered step of the picker: choose the piece, or choose its size. */
export type BundleStep =
  | {
      readonly kind: 'piece';
      readonly key: string;
      readonly piece: number;
      readonly title: string;
      readonly choices: readonly GiftChoiceView[];
      readonly pickedId: string | null;
    }
  | {
      readonly kind: 'size';
      readonly key: string;
      readonly piece: number;
      readonly title: string;
      readonly sizes: NonNullable<GiftChoiceView['sizes']>;
      readonly pickedId: string | null;
      readonly chosen: string | null;
    };

/** Prompt keys of a piece's steps (never clash with option or gift keys). */
export const bundleStepKey = (piece: number): string => `bundle:${piece}`;
export const bundleSizeStepKey = (piece: number): string => `bundle-size:${piece}`;

/**
 * The Bundle price offer the bag would use for this product: live for this shopper, per item,
 * no minimum (the only ones the bag prices), matching the product; highest priority, then the
 * newest edit, like the bag. Null when there is none or it has no usable row.
 */
export function bundleOfferForProduct(
  facts: ProductFacts,
  offers: readonly Offer[],
  ctx: PricingContext,
): ProductBundleOffer | null {
  const candidates = liveOffers(offers, ctx)
    .filter((offer) => {
      if (offer.reward.kind !== 'bundlePrice' || offer.scope !== 'item') return false;
      const minimum = offer.minimum;
      if (minimum && ((minimum.subtotal ?? 0) > 0 || (minimum.quantity ?? 0) > 0)) return false;
      return matchProduct(offer.conditions, offer.exclude, facts) !== 'none';
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  for (const offer of candidates) {
    const rows = bundleRows(offer.reward);
    if (rows.length > 0) return { offer, rows };
  }
  return null;
}

/** The row picked first: the 1-piece row, or the smallest one. */
export function firstBundleRow(rows: readonly OfferBundleRow[]): OfferBundleRow | null {
  return rows.find((row) => row.quantity === 1) ?? rows[0] ?? null;
}

/**
 * The numbered steps for `pieces` pieces. Piece 1 starts on the product being viewed, whose size
 * is the page's own size choice above, so it has no size step here; any other product with sizes
 * gets one once it is chosen.
 */
export function bundleSteps(
  pieces: number,
  currentId: string,
  currentCard: GiftChoiceView,
  choices: readonly BundleChoice[],
  picks: BundlePicks,
): BundleStep[] {
  const steps: BundleStep[] = [];
  const others = choices.filter((choice) => choice.view.productId !== currentId).map((c) => c.view);
  const currentChoice = choices.find((choice) => choice.view.productId === currentId)?.view ?? null;
  for (let piece = 0; piece < pieces; piece++) {
    const list = piece === 0 ? [currentCard, ...others] : currentChoice ? [currentChoice, ...others] : others;
    const pick = picks[piece];
    const pickedId = pick && list.some((card) => card.productId === pick.productId) ? pick.productId : null;
    steps.push({
      kind: 'piece',
      key: bundleStepKey(piece),
      piece,
      title: `Piece ${piece + 1}`,
      choices: list,
      pickedId,
    });
    if (!pickedId || (piece === 0 && pickedId === currentId)) continue;
    const sizes = list.find((card) => card.productId === pickedId)?.sizes;
    if (!sizes) continue;
    const sizeId = pick?.sizeId && sizes.some((size) => size.id === pick.sizeId) ? pick.sizeId : null;
    steps.push({
      kind: 'size',
      key: bundleSizeStepKey(piece),
      piece,
      title: `Piece ${piece + 1} size`,
      sizes,
      pickedId: sizeId,
      chosen: sizes.find((size) => size.id === sizeId)?.label ?? null,
    });
  }
  return steps;
}

/** The first step still open, as the prompt Add to Bag shows; null when every piece is chosen. */
export function missingBundlePrompt(steps: readonly BundleStep[], attempt: number): ChoicePrompt | null {
  const open = steps.find((step) => step.pickedId === null);
  if (!open) return null;
  const message =
    open.kind === 'piece'
      ? `Choose piece ${open.piece + 1} first.`
      : `Choose a size for piece ${open.piece + 1} first.`;
  return { key: open.key, message, attempt };
}

/**
 * The bag line for a piece that is not the page's own product: its size, and the one value of any
 * other option (products with a real choice besides size are never offered, see `toGiftChoice`).
 * Null when the product or its size is no longer offered.
 */
export function bundlePieceLine(choice: BundleChoice, pick: BundlePick): CartLineDraft | null {
  const product = choice.product;
  const selection: Record<string, string> = {};
  for (const option of product.options) {
    if (option.values.length === 0) continue;
    if (option.key === 'size') {
      if (!pick.sizeId || !choice.view.sizes?.some((size) => size.id === pick.sizeId)) return null;
      selection['size'] = pick.sizeId;
    } else {
      selection[option.key] = option.values[0]!.id;
    }
  }
  return {
    productId: product.id,
    variantId: findVariant(product, selection)?.id ?? null,
    selection,
    quantity: 1,
  };
}

/** How much a row saves against `fullPrice` per piece, as a whole percent; 0 when it saves nothing. */
export function bundleSavePercent(row: OfferBundleRow, fullPrice: number): number {
  const full = row.quantity * fullPrice;
  if (!(full > 0) || row.price >= full) return 0;
  return Math.floor(((full - row.price) / full) * 100);
}
