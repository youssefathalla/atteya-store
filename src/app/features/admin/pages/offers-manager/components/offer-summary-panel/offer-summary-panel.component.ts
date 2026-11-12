import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import type { SentencePart } from '../../models/offer-admin.model';

/** The example product on the right panel, priced with the offer. */
export interface SampleProduct {
  readonly name: string;
  readonly imagePath: string | null;
  readonly badge: string | null;
  readonly listPrice: number;
  readonly offerPrice: number;
  readonly partial: boolean;
}

/**
 * The right panel of the offer editor: "Your offer so far" in one sentence (hidden on step 4),
 * how the top banner will look when it is on, and how a product will look.
 */
@Component({
  selector: 'app-offer-summary-panel',
  host: { class: 'block w-full' },
  imports: [NgOptimizedImage, AppImageFallbackDirective, EgpPricePipe],
  template: `
    <aside class="elements-start-col items-stretch! gap-4 w-full" aria-label="Offer summary">
      @if (sentence(); as parts) {
        <div class="offer-dark-box" aria-live="polite">
          <p class="font-label-lg opacity-80">Your offer so far</p>
          <p class="font-title-lg font-bold! mt-2">
            @for (part of parts; track $index) {
              <span [class.opacity-60]="part.placeholder">{{ part.text }}</span>
            }
          </p>
        </div>
      }

      <div class="surface-card p-5 w-full elements-start-col items-stretch! gap-3">
        @if (!sentence()) {
          <p class="font-title-sm font-bold!">What shoppers will see</p>
        }
        @if (bannerText(); as text) {
          @if (sentence()) {
            <p class="font-title-sm font-bold!">How the top banner will look</p>
          }
          <p class="offer-banner-sample">{{ text }}</p>
        }
        @if (sentence()) {
          <p class="font-title-sm font-bold!">How a product will look</p>
        }
        @if (sample(); as product) {
          <div class="relative w-full aspect-square overflow-hidden border-shape bg-surface-container">
            @if (product.imagePath) {
              <img
                [ngSrc]="product.imagePath"
                [appImageFallback]="product.imagePath"
                [alt]="product.name"
                fill
                sizes="20rem"
                class="object-cover"
              />
            }
            @if (product.badge) {
              <span class="offer-sample-badge">{{ product.badge }}</span>
            }
          </div>
          <p class="font-title-sm font-bold!">{{ product.name }}</p>
          <p class="elements-start items-baseline! flex-wrap gap-2 font-title-sm">
            @if (product.offerPrice < product.listPrice) {
              <s class="text-on-surface-variant">{{ product.listPrice | egpPrice }}</s>
            }
            <span class="font-bold!">
              @if (product.partial) {
                From
              }
              {{ product.offerPrice | egpPrice }}
            </span>
          </p>
        } @else {
          <p class="font-body-sm text-on-surface-variant">Pick products to see an example.</p>
        }
      </div>
    </aside>
  `,
})
export class OfferSummaryPanelComponent {
  /** The sentence; null hides "Your offer so far" (step 4). */
  readonly sentence = input<readonly SentencePart[] | null>(null);
  readonly sample = input<SampleProduct | null>(null);
  /** The top banner text while the banner is on; null hides it. */
  readonly bannerText = input<string | null>(null);
}
