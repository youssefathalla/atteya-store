import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CartService } from '@core/services/cart/cart.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { CartLineDraft } from '@core/services/cart/cart.model';

@Component({
  selector: 'app-add-to-bag-button',
  imports: [MatButtonModule],
  template: `
    <button matButton="filled" type="button" [disabled]="!line()" (click)="addToBag()">
      Add to Bag
    </button>
  `,
  host: { class: 'block w-full' },
})
export class AddToBagButtonComponent {
  readonly line = input<CartLineDraft | null>(null);

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
