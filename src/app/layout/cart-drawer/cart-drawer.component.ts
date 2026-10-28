import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, getDoc } from 'firebase/firestore';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import { displayDecimals } from '@core/services/offers/engine';
import { ProductSchema } from '@core/services/products/product.schema';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';

@Component({
  selector: 'app-cart-drawer',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './cart-drawer.component.html',
  host: {
    class: 'h-full flex flex-col',
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class CartDrawerComponent {
  readonly drawerService = inject(DrawerService);
  readonly #cart = inject(CartService);
  readonly #currency = inject(CurrencyService);
  readonly #firestore = injectFirestore();

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;
  readonly count = this.#cart.count;

  removeLine(index: number): void {
    this.#cart.removeAt(index);
  }

  decreaseQuantity(index: number): void {
    const line = this.lines()[index];
    if (!line) return;
    if (line.quantity <= 1) {
      this.#cart.removeAt(index);
      return;
    }
    this.#cart.setQuantity(index, line.quantity - 1);
  }

  increaseQuantity(index: number): void {
    const line = this.lines()[index];
    if (!line || line.quantity >= 20) return;
    this.#cart.setQuantity(index, line.quantity + 1);
  }

  readonly namesResource = resource({
    params: () => this.lines(),
    loader: async ({ params: lines }) => {
      if (lines.length === 0) return new Map<string, string>();
      const converter = createValibotConverter(ProductSchema);
      const names = new Map<string, string>();
      for (const line of lines) {
        if (names.has(line.productId)) continue;
        const snap = await getDoc(
          doc(this.#firestore, 'products', line.productId).withConverter(converter),
        );
        if (snap.exists()) names.set(line.productId, snap.data().name);
      }
      return names;
    },
  });

  readonly subtotal = computed(() => {
    const entry = this.#currency.entry();
    return formatMoney(0, entry.code, displayDecimals(entry.code));
  });

  nameFor(productId: string): string {
    return this.namesResource.value()?.get(productId) ?? 'Item';
  }

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
