import { isPlatformServer } from '@angular/common';
import { inject, makeStateKey, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { ProductService } from '@core/services/products';
import { matchProduct, type Offer } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { type TransferOffer, toTransferOffer } from '@core/services/offers/offer-transfer';
import { PublicOffersReader } from '@core/services/offers/public-offers.reader';
import {
  type ProductPageResult,
  type ProductView,
  toProductView,
} from '../models/product-page.model';

const MAX_SLUG_LENGTH = 200;

export const productPageResolver: ResolveFn<ProductPageResult> = async (route) => {
  const products = inject(ProductService);
  const offersReader = inject(PublicOffersReader);
  const transfer = inject(TransferState);
  const isServer = isPlatformServer(inject(PLATFORM_ID));
  const responseInit = inject(RESPONSE_INIT, { optional: true });

  const slug = (route.paramMap.get('slug') ?? '').trim();
  const key = makeStateKey<ProductPageResult>(`product-page:${slug}`);

  if (!isServer && transfer.hasKey(key)) {
    const cached = transfer.get(key, { status: 'error' });
    transfer.remove(key);
    return cached;
  }

  let result: ProductPageResult;
  if (!slug || slug.length > MAX_SLUG_LENGTH) {
    result = { status: 'missing' };
  } else {
    const offersPromise = offersReader.fetchActivePublic().catch(() => null);
    try {
      const product = await products.getBySlug(slug);
      if (!product) {
        result = { status: 'missing' };
      } else {
        const view = toProductView(product);
        const renderedAtMs = Date.now();
        result = {
          status: 'found',
          product: view,
          offers: relevantOffers(view, await offersPromise, renderedAtMs),
          renderedAtMs,
        };
      }
    } catch {
      // Maps read failures to a typed result (no loading/error signals) so navigation never blocks or returns HTTP 500.
      result = { status: 'error' };
    }
  }

  if (isServer) {
    if (responseInit) {
      if (result.status === 'missing') {
        responseInit.status = 404;
      } else if (result.status === 'error') {
        responseInit.status = 503;
      }
    }
    transfer.set(key, result);
  }
  return result;
};

/**
 * Keep only offers that can still matter for this product: not ended yet (upcoming ones stay so an
 * open page can start them on time) and not ruled out by matchProduct. Keeps TransferState HTML small.
 * Pricing itself still goes through priceItem/displayPrice, which re-check the window and audience.
 */
function relevantOffers(
  product: ProductView,
  offers: readonly Offer[] | null,
  nowMs: number,
): readonly TransferOffer[] | null {
  if (!offers) return null;
  const facts = toPricedProduct(product);
  return offers
    .filter((offer) => !offer.schedule.endsAt || offer.schedule.endsAt.getTime() > nowMs)
    .filter((offer) => matchProduct(offer.conditions, offer.exclude, facts) !== 'none')
    .map(toTransferOffer);
}
