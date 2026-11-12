import type { Offer } from '@core/services/offers/engine';
import type { Product } from '@core/services/products/product.model';
import type { ProductCardPrice } from './product-card.model';
import { productCardPrice } from './product-card.utils';

/** Card prices for a listing: live offers when `live`, else price and compare-at only. */
export function listingCardPrices(
  products: readonly Product[],
  offers: readonly Offer[],
  opts: { readonly live: boolean; readonly now: Date; readonly signedIn: boolean },
): ReadonlyMap<string, ProductCardPrice> {
  const ctx = { now: opts.now, signedIn: opts.signedIn };
  const map = new Map<string, ProductCardPrice>();
  for (const product of products) {
    map.set(product.id, productCardPrice(product, opts.live ? offers : null, ctx));
  }
  return map;
}
