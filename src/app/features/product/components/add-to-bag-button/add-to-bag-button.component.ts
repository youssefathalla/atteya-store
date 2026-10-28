import { Component, inject, InjectionToken, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
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
      [disabled]="!line()"
      (click)="addToBag()"
      [attr.aria-describedby]="hintId"
    >
      Add to bag
    </button>
    <p [id]="hintId" class="font-label-sm opacity-70 pt-1">
      Bank-transfer checkout is available for delivery outside Egypt.
    </p>
  `,
  host: { class: 'block w-full' },
})
export class AddToBagButtonComponent {
  readonly line = input<CartLineDraft | null>(null);
  readonly hintId = `add-to-bag-hint-${inject(HINT_ID_COUNTER).next++}`;

  readonly #cart = inject(CartService);
  readonly #drawer = inject(DrawerService);
  readonly #snackbar = inject(SnackbarService);

  addToBag(): void {
    const draft = this.line();
    if (!draft) return;
    this.#cart.add(draft);
    this.#snackbar.success('Added to your bag');
    this.#drawer.open('cart');
  }
}
