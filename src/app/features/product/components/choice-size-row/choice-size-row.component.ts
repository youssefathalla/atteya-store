import { Component, input, output } from '@angular/core';
import type { GiftSizeView } from '@core/services/cart/cart-gifts';

/**
 * One size step under a picked product (Gift Box, Bundle price picker, Bundle & Save): the step's
 * title with the chosen size and a ✓ on the right, then one box per size in three columns. Each
 * size is a button with `aria-pressed` and `data-choice`, so the step can be focused when asked for.
 */
@Component({
  selector: 'app-choice-size-row',
  template: `
    <div class="elements-between w-full gap-3 pb-2" aria-hidden="true">
      <span class="font-label-lg">{{ title() }}</span>
      @if (chosen()) {
        <span class="font-label-lg text-end">{{ chosen() }} ✓</span>
      }
    </div>
    <div class="grid w-full grid-cols-3 gap-2">
      @for (size of sizes(); track size.id) {
        <button
          type="button"
          data-choice
          class="pdp-choice"
          [disabled]="disabled()"
          [attr.aria-pressed]="pickedId() === size.id"
          (click)="picked.emit(size.id)"
        >
          {{ size.label }}
        </button>
      }
    </div>
  `,
  host: { class: 'block w-full' },
})
export class ChoiceSizeRowComponent {
  /** "2. Bag size". */
  readonly title = input.required<string>();
  readonly sizes = input.required<readonly GiftSizeView[]>();
  readonly pickedId = input<string | null>(null);
  /** Label of the chosen size, shown with a ✓; null hides it. */
  readonly chosen = input<string | null>(null);
  readonly disabled = input<boolean>(false);

  readonly picked = output<string>();
}
