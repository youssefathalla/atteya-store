import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { CartLineDraft } from '@core/services/cart/cart.model';

/**
 * Stays pressable while the product can be bought. With a choice still missing
 * (usually the size) it adds nothing and tells the page, which asks the shopper to choose.
 */
@Component({
  selector: 'app-add-to-bag-button',
  imports: [MatButtonModule],
  template: `
    <button
      matButton="filled"
      class="btn-block"
      type="button"
      [disabled]="unavailable()"
      (click)="addToBag()"
    >
      Add to Bag
    </button>
  `,
  host: { class: 'block w-full' },
})
export class AddToBagButtonComponent {
  readonly line = input<CartLineDraft | null>(null);
  /** Out of stock or no longer sold. */
  readonly unavailable = input<boolean>(false);

  readonly choiceMissing = output<void>();

  readonly #cart = inject(CartService);
  readonly #drawer = inject(DrawerService);
  readonly #snackbar = inject(SnackbarService);

  addToBag(): void {
    const draft = this.line();
    if (!draft) {
      this.choiceMissing.emit();
      return;
    }
    if (!this.#cart.add(draft)) {
      this.#snackbar.error('Your bag is full. Remove an item to add this one.');
      return;
    }
    this.#snackbar.success('Added to your bag');
    this.#drawer.open('cart');
  }
}
