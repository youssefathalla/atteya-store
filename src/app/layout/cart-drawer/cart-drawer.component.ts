import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, getDoc } from 'firebase/firestore';
import {
  canCheckout,
  cartSubtotalDisplay,
  lineDisplayAmount,
} from '@core/services/cart/cart-pricing';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import { displayDecimals, toDisplayAmount } from '@core/services/offers/engine';
import { ProductSchema } from '@core/services/products/product.schema';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';

interface CartProductInfo {
  readonly name: string;
  readonly price: number;
}

@Component({
  selector: 'app-cart-drawer',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './cart-drawer.component.html',
  host: {
    // min-h-0 lets the flex mid section scroll inside a viewport-bounded drawer
    class: 'h-full min-h-0 flex flex-col',
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
  readonly showCheckout = computed(() => canCheckout(!this.isEmpty()));

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

  readonly productsResource = resource({
    params: () => this.lines(),
    loader: async ({ params: lines }) => {
      if (lines.length === 0) return new Map<string, CartProductInfo>();
      const converter = createValibotConverter(ProductSchema);
      const products = new Map<string, CartProductInfo>();
      for (const line of lines) {
        if (products.has(line.productId)) continue;
        const snap = await getDoc(
          doc(this.#firestore, 'products', line.productId).withConverter(converter),
        );
        if (snap.exists()) {
          const data = snap.data();
          products.set(line.productId, { name: data.name, price: data.price });
        }
      }
      return products;
    },
  });

  /** Catalog unit prices converted into the visitor's display currency. */
  readonly #unitDisplayByProductId = computed(() => {
    const entry = this.#currency.entry();
    const map = new Map<string, number>();
    for (const [id, info] of this.productsResource.value() ?? []) {
      map.set(id, toDisplayAmount(info.price, entry));
    }
    return map;
  });

  readonly subtotal = computed(() => {
    const entry = this.#currency.entry();
    const amount = cartSubtotalDisplay(this.lines(), this.#unitDisplayByProductId());
    return formatMoney(amount, entry.code, displayDecimals(entry.code));
  });

  nameFor(productId: string): string {
    return this.productsResource.value()?.get(productId)?.name ?? 'Item';
  }

  linePriceLabel(productId: string, quantity: number): string {
    const unit = this.#unitDisplayByProductId().get(productId);
    if (typeof unit !== 'number') return '';
    const entry = this.#currency.entry();
    return formatMoney(lineDisplayAmount(unit, quantity), entry.code, displayDecimals(entry.code));
  }

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
