import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CartService } from '@core/services/cart/cart.service';
import { MetaPixelService } from '@core/services/analytics/meta-pixel.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { CartLineDraft } from '@core/services/cart/cart.model';

/**
 * Stays pressable while the product can be bought. With a choice still missing
 * (usually the size) it adds nothing and tells the page, which asks the shopper to choose.
 * `lines` adds several bag lines at once (a Bundle price picker's pieces), all or none.
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
      {{ label() }}
    </button>
  `,
  host: { class: 'block w-full' },
})
export class AddToBagButtonComponent {
  readonly lines = input<readonly CartLineDraft[] | null>(null);
  /** "Add to Bag", or with the bundle total ("Add 2 to Bag · EGP 200"). */
  readonly label = input<string>('Add to Bag');
  /** Out of stock or no longer sold. */
  readonly unavailable = input<boolean>(false);
  /** Total in EGP for what this press adds, sent to the Meta Pixel. Null when the page doesn't know it. */
  readonly valueEgp = input<number | null>(null);

  readonly choiceMissing = output<void>();

  readonly #cart = inject(CartService);
  readonly #drawer = inject(DrawerService);
  readonly #snackbar = inject(SnackbarService);
  readonly #pixel = inject(MetaPixelService);

  addToBag(): void {
    const drafts = this.lines();
    if (!drafts || drafts.length === 0) {
      this.choiceMissing.emit();
      return;
    }
    const added = drafts.length === 1 ? this.#cart.add(drafts[0]!) : this.#cart.addAll(drafts);
    if (!added) {
      this.#snackbar.error(
        drafts.length === 1
          ? 'Your bag is full. Remove an item to add this one.'
          : 'Your bag is full. Remove an item to add these.',
      );
      return;
    }
    this.#pixel.trackAddToCart(drafts, this.valueEgp());
    this.#snackbar.success('Added to your bag');
    this.#drawer.open('cart');
  }
}
