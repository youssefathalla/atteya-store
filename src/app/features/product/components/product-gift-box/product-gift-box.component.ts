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
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll/horizontal-scroll.directive';
import { RowScrollNavComponent } from '@shared/ui/row-scroll-nav';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type { GiftCardColour } from '@core/services/cart/gift-card-label';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ChoicePrompt } from '../../models/product-page.model';
import { type GiftBoxView, type GiftPicks, giftSteps } from '../../utils/product-gifts';

/**
 * Gift Box: the Free gift offer on the product page. A black header names the gifts, then one
 * numbered step per gift (and per gift size). Each gift is one row of big photo cards that scrolls sideways (drag, swipe, arrows); sizes are boxes; every choice is a button with `aria-pressed`.
 */
@Component({
  selector: 'app-product-gift-box',
  imports: [
    NgOptimizedImage,
    AppImageFallbackDirective,
    HorizontalScrollDirective,
    RowScrollNavComponent,
    ColorSwatchComponent,
    SharedIconModule,
  ],
  templateUrl: './product-gift-box.component.html',
  host: { class: 'block w-full' },
})
export class ProductGiftBoxComponent {
  readonly box = input.required<GiftBoxView>();
  readonly picks = input.required<GiftPicks>();
  readonly disabled = input<boolean>(false);
  /** Set by the page when Add to Bag is pressed before every gift is chosen. */
  readonly prompt = input<ChoicePrompt | null>(null);

  readonly productPicked = output<{ giftId: string; productId: string }>();
  readonly sizePicked = output<{ giftId: string; sizeId: string }>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);

  readonly path = normalizeImageKitPath;
  protected readonly Math = Math;

  readonly steps = computed(() => giftSteps(this.box(), this.picks()));

  constructor() {
    effect(() => {
      const prompt = this.prompt();
      if (!prompt) return;
      untracked(() =>
        afterNextRender({ write: () => this.#focusStep(prompt.key) }, { injector: this.#injector }),
      );
    });
  }

  isProductPicked(giftId: string, productId: string): boolean {
    return this.picks()[giftId]?.productId === productId;
  }

  /** "White", "Black and Grey", "Red, White and Blue". */
  colourNames(colours: readonly GiftCardColour[]): string {
    const names = colours.map((colour) => colour.label);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  isSizePicked(giftId: string, sizeId: string): boolean {
    return this.picks()[giftId]?.sizeId === sizeId;
  }

  #focusStep(key: string): void {
    const step = this.#host.nativeElement.querySelector(`[data-gift-step="${key}"]`);
    step?.querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)')?.focus();
  }
}
