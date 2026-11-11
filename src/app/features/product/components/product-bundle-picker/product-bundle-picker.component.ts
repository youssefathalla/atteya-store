import { NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  untracked,
} from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import type { GiftCardColour } from '@core/services/cart/gift-card-label';
import type { OfferBundleRow } from '@core/services/offers/engine';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll/horizontal-scroll.directive';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { RowScrollNavComponent } from '@shared/ui/row-scroll-nav';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ChoicePrompt } from '../../models/product-page.model';
import type { BundleStep } from '../../utils/product-bundle';

/** One quantity row as the picker shows it, amounts already written in the visitor's currency. */
export interface BundleRowView {
  readonly row: OfferBundleRow;
  /** "Get 2 for EGP 200". */
  readonly title: string;
  /** The price of one piece in this row. */
  readonly perPiece: string;
  /** The full price of one piece, struck through; empty when the row saves nothing. */
  readonly fullPrice: string;
  /** Whole percent saved; 0 hides the tag. */
  readonly savePercent: number;
}

/**
 * Bundle price picker on the product page: one radio row per number of pieces, then one numbered
 * step per piece, each a sideways row of photo cards like the Gift Box (and a size step when the
 * chosen product has sizes). Every card is a button with `aria-pressed`.
 */
@Component({
  selector: 'app-product-bundle-picker',
  imports: [
    NgOptimizedImage,
    MatRadioModule,
    AppImageFallbackDirective,
    HorizontalScrollDirective,
    RowScrollNavComponent,
    ColorSwatchComponent,
    SharedIconModule,
  ],
  templateUrl: './product-bundle-picker.component.html',
  host: { class: 'block w-full' },
})
export class ProductBundlePickerComponent {
  readonly offerId = input.required<string>();
  readonly rows = input.required<readonly BundleRowView[]>();
  /** Number of pieces of the picked row. */
  readonly pieces = input.required<number>();
  readonly steps = input.required<readonly BundleStep[]>();
  readonly disabled = input<boolean>(false);
  /** Set by the page when Add to Bag is pressed before every piece is chosen. */
  readonly prompt = input<ChoicePrompt | null>(null);

  readonly rowPicked = output<number>();
  readonly productPicked = output<{ piece: number; productId: string }>();
  readonly sizePicked = output<{ piece: number; sizeId: string }>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);

  readonly path = normalizeImageKitPath;
  protected readonly Math = Math;

  readonly groupLabelId = computed(() => `pdp-bundle-heading-${this.offerId()}`);

  constructor() {
    effect(() => {
      const prompt = this.prompt();
      if (!prompt) return;
      untracked(() =>
        afterNextRender({ write: () => this.#focusStep(prompt.key) }, { injector: this.#injector }),
      );
    });
  }

  /** "White", "Black and Grey", "Red, White and Blue". */
  colourNames(colours: readonly GiftCardColour[]): string {
    const names = colours.map((colour) => colour.label);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  #focusStep(key: string): void {
    const step = this.#host.nativeElement.querySelector(`[data-bundle-step="${key}"]`);
    step?.querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)')?.focus();
  }
}
