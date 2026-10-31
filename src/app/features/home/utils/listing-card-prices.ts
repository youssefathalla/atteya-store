import { displayPrice, type Offer } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import type { Product } from '@core/services/products/product.model';
import type { ProductCardPrice } from '@shared/components/product-card/product-card.model';

export function listingCardPrices(
  products: readonly Product[],
  offers: readonly Offer[],
  opts: { readonly live: boolean; readonly now: Date; readonly signedIn: boolean },
): ReadonlyMap<string, ProductCardPrice> {
  const map = new Map<string, ProductCardPrice>();
  const ctx = { now: opts.now, signedIn: opts.signedIn };

  for (const product of products) {
    if (opts.live) {
      const d = displayPrice(toPricedProduct(product), offers, ctx);
      map.set(product.id, {
        price: d.partial ? product.price : d.fromPrice,
        fromPrice: d.partial ? d.fromPrice : null,
        listPrice: d.listPrice,
        partial: d.partial,
        badges: [],
      });
      continue;
    }
    const list = product.compareAtPrice;
    const onSale = list !== null && list > product.price;
    map.set(product.id, {
      price: product.price,
      fromPrice: null,
      listPrice: onSale ? list : null,
      partial: false,
      badges: [],
    });
  }
  return map;
}
