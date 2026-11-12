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
import type { CartLineDraft } from '@core/services/cart/cart.model';
import type { ChoicePrompt } from '../../models/product-page.model';
import type { BundleSaveStep } from '../../utils/product-bundle-save';
import { AddToBagButtonComponent } from '../add-to-bag-button/add-to-bag-button.component';
import { ChoiceCardRowComponent } from '../choice-card-row/choice-card-row.component';
import { ChoiceSizeRowComponent } from '../choice-size-row/choice-size-row.component';

/**
 * Bundle & Save on the product page: a black header with the offer title and the saving, then one
 * numbered step per piece of the set. The product being viewed fills its own step ("This racket ✓");
 * every other piece is a sideways row of photo cards (`app-choice-card-row`, like the Gift Box and
 * the Bundle price picker), plus a size step once a product with sizes is picked. Ends with
 * **Add Bundle to Bag**, which adds every piece in one change.
 */
@Component({
  selector: 'app-product-bundle-save',
  imports: [ChoiceCardRowComponent, ChoiceSizeRowComponent, AddToBagButtonComponent],
  templateUrl: './product-bundle-save.component.html',
  host: { class: 'block w-full' },
})
export class ProductBundleSaveComponent {
  readonly offerId = input.required<string>();
  /** The offer's title. */
  readonly title = input.required<string>();
  /** "Save EGP 300", "Save 15%", "Cheapest item free". */
  readonly saving = input.required<string>();
  readonly steps = input.required<readonly BundleSaveStep[]>();
  /** One bag line per piece, or null while a piece (or this product's own choice) is still open. */
  readonly lines = input<readonly CartLineDraft[] | null>(null);
  /** "Add Bundle to Bag · EGP 4,900". */
  readonly buttonLabel = input.required<string>();
  readonly disabled = input<boolean>(false);
  /** Set by the page when Add Bundle to Bag is pressed before every piece is chosen. */
  readonly prompt = input<ChoicePrompt | null>(null);

  readonly productPicked = output<{ piece: number; productId: string }>();
  readonly sizePicked = output<{ piece: number; sizeId: string }>();
  readonly choiceMissing = output<void>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);

  readonly headingId = computed(() => `pdp-set-heading-${this.offerId()}`);

  constructor() {
    effect(() => {
      const prompt = this.prompt();
      if (!prompt || !prompt.key.startsWith('set')) return;
      untracked(() =>
        afterNextRender({ write: () => this.#focusStep(prompt.key) }, { injector: this.#injector }),
      );
    });
  }

  #focusStep(key: string): void {
    const step = this.#host.nativeElement.querySelector(`[data-set-step="${key}"]`);
    step?.querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)')?.focus();
  }
}
