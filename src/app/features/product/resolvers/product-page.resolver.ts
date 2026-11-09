import { isPlatformServer } from '@angular/common';
import { inject, Injector, makeStateKey, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { ProductCacheService, ProductService } from '@core/services/products';
import { matchProduct, type Offer } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { type TransferOffer, toTransferOffer } from '@core/services/offers/offer-transfer';
import { PublicOffersReader } from '@core/services/offers/public-offers.reader';
import { type ProductPageResult, type ProductView, toProductView } from '../models/product-page.model';

const MAX_SLUG_LENGTH = 200;

export const productPageResolver: ResolveFn<ProductPageResult> = async (route) => {
  const products = inject(ProductService);
  const cache = inject(ProductCacheService);
  const offersReader = inject(PublicOffersReader);
  const transfer = inject(TransferState);
  const isServer = isPlatformServer(inject(PLATFORM_ID));
  const injector = inject(Injector);
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
    const offersPromise = readOffers(isServer, injector, offersReader);
    try {
      const product = await (isServer ? products.getBySlug(slug) : cache.getBySlug(slug));
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
      const cacheControl = pageCacheControl(result.status);
      if (result.status === 'missing') {
        responseInit.status = 404;
      } else if (result.status === 'error') {
        responseInit.status = 503;
      }
      if (cacheControl) {
        const headers = new Headers(responseInit.headers);
        headers.set('Cache-Control', cacheControl);
        responseInit.headers = headers;
      }
    }
    transfer.set(key, result);
  }
  return result;
};

/** 503 and missing product pages carry geo-priced layout; never CDN-cache. Found pages use the route header. */
function pageCacheControl(status: ProductPageResult['status']): string | null {
  if (status === 'error') return 'private, no-store';
  if (status === 'missing') return 'private, no-store';
  return null;
}

async function readOffers(
  isServer: boolean,
  injector: Injector,
  reader: PublicOffersReader,
): Promise<readonly Offer[] | null> {
  if (!isServer) {
    try {
      const { OffersService } = await import('@core/services/offers/offers.service');
      const live = injector.get(OffersService);
      if (live.ready() && !live.failed()) return live.all();
    } catch {
      /* chunk load failed -> one-time read below */
    }
  }
  return reader.fetchActivePublic().catch(() => null);
}

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
