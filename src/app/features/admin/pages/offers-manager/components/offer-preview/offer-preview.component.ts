import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import {
  displayPrice,
  formatCairoDateTimeInput,
  matchProduct,
  parseCairoDateTimeInput,
  type Offer,
  type OfferDraft,
  type OfferValidationResult,
  type PricingContext,
} from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import type { Product } from '@core/services/products/product.model';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { normalizeImageKitPath } from '@shared/utils/image';

export type PreviewViewMode = 'visitor' | 'signedIn' | 'withCode';

export interface PreviewSampleRow {
  readonly id: string;
  readonly name: string;
  readonly imagePath: string | null;
  readonly currentPrice: number;
  readonly offerPrice: number;
  readonly saving: number;
  readonly badge: string | null;
  readonly partial: boolean;
}

@Component({
  selector: 'app-offer-preview',
  host: { class: 'block w-full' },
  imports: [NgOptimizedImage, AppImageFallbackDirective, EgpPricePipe],
  templateUrl: './offer-preview.component.html',
})
export class OfferPreviewComponent {
  readonly draft = input.required<OfferDraft>();
  readonly products = input.required<readonly Product[]>();
  readonly validation = input.required<OfferValidationResult>();

  readonly viewMode = signal<PreviewViewMode>('withCode');
  readonly customAt = signal<Date | null>(null);

  readonly atInput = computed(() =>
    formatCairoDateTimeInput(this.customAt() ?? this.draft().schedule.startsAt ?? new Date()),
  );

  readonly previewSummary = computed(() => {
    const draft = this.draft();
    const products = this.products();
    const mode = this.viewMode();
    const evalTime =
      this.customAt() ?? draft.schedule.startsAt ?? new Date();

    const simulatedOffer: Offer = {
      ...draft,
      id: draft.id ?? 'preview-offer',
      active: true,
      archived: false,
    };

    const ctx: PricingContext = {
      now: evalTime,
      signedIn: mode === 'signedIn' || mode === 'withCode',
      codes:
        mode === 'withCode' && draft.code?.trim()
          ? [draft.code.trim().toUpperCase()]
          : [],
    };

    let fullCount = 0;
    let partialCount = 0;
    const sampleRows: PreviewSampleRow[] = [];

    for (const product of products) {
      const priced = toPricedProduct(product);
      const level = matchProduct(draft.conditions, draft.exclude, priced);
      if (level === 'none') continue;
      if (level === 'full') fullCount += 1;
      else partialCount += 1;

      if (sampleRows.length < 10) {
        const res = displayPrice(priced, [simulatedOffer], ctx);
        const rawImage = product.images[0]?.path;
        sampleRows.push({
          id: product.id,
          name: product.name,
          imagePath: rawImage ? normalizeImageKitPath(rawImage) : null,
          currentPrice: product.price,
          offerPrice: res.fromPrice,
          saving: Math.max(0, product.price - res.fromPrice),
          badge: res.badges[0]?.text ?? null,
          partial: level === 'partial',
        });
      }
    }

    return {
      totalMatched: fullCount + partialCount,
      partialCount,
      sampleRows,
    };
  });

  onViewModeChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as PreviewViewMode;
    this.viewMode.set(val);
  }

  onAtChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.customAt.set(parseCairoDateTimeInput(raw, false));
  }
}
