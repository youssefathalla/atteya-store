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
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ChoicePrompt } from '../../models/product-page.model';
import { type GiftBoxView, type GiftPicks, giftSteps } from '../../utils/product-gifts';

/**
 * Gift Box: the Free gift offer on the product page. A black header names the gifts, then one
 * numbered step per gift (and per gift size). Gift choices are photo tiles, sizes are boxes; every choice is a button with `aria-pressed`.
 */
@Component({
  selector: 'app-product-gift-box',
  imports: [NgOptimizedImage, AppImageFallbackDirective],
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

  isSizePicked(giftId: string, sizeId: string): boolean {
    return this.picks()[giftId]?.sizeId === sizeId;
  }

  #focusStep(key: string): void {
    const step = this.#host.nativeElement.querySelector(`[data-gift-step="${key}"]`);
    step?.querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)')?.focus();
  }
}
