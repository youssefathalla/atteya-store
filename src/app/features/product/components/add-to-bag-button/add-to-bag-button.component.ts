import { Component, inject, InjectionToken, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { CartLineDraft } from '@core/services/cart/cart.model';

const HINT_ID_COUNTER = new InjectionToken('ADD_TO_BAG_HINT_COUNTER', {
  providedIn: 'root',
  factory: () => ({ next: 0 }),
});

@Component({
  selector: 'app-add-to-bag-button',
  imports: [MatButtonModule],
  template: `
    <button
      matButton="filled"
      type="button"
      disabled
      disabledInteractive
      [attr.aria-describedby]="hintId"
    >
      Add to bag
    </button>
    <p [id]="hintId" class="font-label-sm text-on-surface-variant pt-1">
      Coming soon. Online ordering opens shortly.
    </p>
  `,
  host: { class: 'block w-full' },
})
export class AddToBagButtonComponent {
  /** Ready-to-add line, or null when nothing (or an unavailable option) is selected. */
  readonly line = input<CartLineDraft | null>(null);
  readonly hintId = `add-to-bag-hint-${inject(HINT_ID_COUNTER).next++}`;
  // Later: inject(CartService) and call add(this.line()) here; remove `disabled`, bind [disabled]="!line()".
}
