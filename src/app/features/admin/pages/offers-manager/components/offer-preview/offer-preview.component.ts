import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { displayPrice, offerMatch, type Offer, type OfferDraft } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import type { Product } from '@core/services/products/product.model';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { normalizeImageKitPath } from '@shared/utils/image';

/** Most rows the list shows; the rest is "And n more." */
const MAX_ROWS = 100;

export interface PreviewRow {
  readonly id: string;
  readonly name: string;
  readonly imagePath: string | null;
  readonly currentPrice: number;
  readonly offerPrice: number;
  readonly partial: boolean;
  readonly inStock: boolean;
}

/** The product list behind "See the Products" on step 2, priced as the offer would price them now. */
@Component({
  selector: 'app-offer-preview',
  host: { class: 'block w-full' },
  imports: [NgOptimizedImage, AppImageFallbackDirective, EgpPricePipe],
  templateUrl: './offer-preview.component.html',
})
export class OfferPreviewComponent {
  readonly draft = input.required<OfferDraft>();
  readonly products = input.required<readonly Product[]>();

  readonly #matched = computed(() => {
    const draft = this.draft();
    const offer: Offer = { ...draft, id: draft.id ?? 'preview-offer', active: true, archived: false };
    const ctx = { now: draft.schedule.startsAt ?? new Date(), signedIn: true };
    const rows: PreviewRow[] = [];
    let total = 0;
    for (const product of this.products()) {
      const priced = toPricedProduct(product);
      const level = offerMatch(draft, priced);
      if (level === 'none') continue;
      total += 1;
      if (rows.length >= MAX_ROWS) continue;
      const res = displayPrice(priced, [offer], ctx);
      const rawImage = product.images[0]?.path;
      rows.push({
        id: product.id,
        name: product.name,
        imagePath: rawImage ? normalizeImageKitPath(rawImage) : null,
        currentPrice: product.price,
        offerPrice: res.fromPrice,
        partial: level === 'partial',
        inStock: product.inStock,
      });
    }
    return { rows, total };
  });

  readonly rows = computed(() => this.#matched().rows);
  readonly more = computed(() => this.#matched().total - this.#matched().rows.length);
}
