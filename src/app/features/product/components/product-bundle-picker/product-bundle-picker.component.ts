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
import type { OfferBundleRow } from '@core/services/offers/engine';
import type { ChoicePrompt } from '../../models/product-page.model';
import type { BundleStep } from '../../utils/product-bundle';
import { ChoiceCardRowComponent } from '../choice-card-row/choice-card-row.component';

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
  imports: [MatRadioModule, ChoiceCardRowComponent],
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

  #focusStep(key: string): void {
    const step = this.#host.nativeElement.querySelector(`[data-bundle-step="${key}"]`);
    step?.querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)')?.focus();
  }
}
