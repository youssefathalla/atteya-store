import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, getDoc } from 'firebase/firestore';
import { canCheckout, cartSubtotalDisplay } from '@core/services/cart/cart-pricing';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import { displayDecimals, toDisplayAmount } from '@core/services/offers/engine';
import { ProductSchema } from '@core/services/products/product.schema';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';

interface CartProductOptionValue {
  readonly id: string;
  readonly label: string;
}

interface CartProductOption {
  readonly key: string;
  readonly label: string;
  readonly values: readonly CartProductOptionValue[];
}

interface CartProductInfo {
  readonly name: string;
  readonly slug: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly imagePath: string | null;
  readonly imageAlt: string;
  readonly options: readonly CartProductOption[];
}

@Component({
  selector: 'app-cart-drawer',
  imports: [
    RouterLink,
    NgOptimizedImage,
    MatButtonModule,
    SharedIconModule,
    ProductPriceComponent,
    AppImageFallbackDirective,
  ],
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
          const primary = data.images[0];
          products.set(line.productId, {
            name: data.name,
            slug: data.slug,
            price: data.price,
            compareAtPrice: data.compareAtPrice,
            imagePath: primary?.path ?? null,
            imageAlt: primary?.alt || data.name,
            options: data.options.map((option) => ({
              key: option.key,
              label: option.label,
              values: option.values.map((value) => ({ id: value.id, label: value.label })),
            })),
          });
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

  productInfo(productId: string): CartProductInfo | undefined {
    return this.productsResource.value()?.get(productId);
  }

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  /** Line total in EGP (unit × qty) for listing sale display. */
  lineTotalPrice(info: CartProductInfo, quantity: number): number {
    return info.price * quantity;
  }

  lineTotalListPrice(info: CartProductInfo, quantity: number): number | null {
    const list = info.compareAtPrice;
    return list !== null && list > info.price ? list * quantity : null;
  }

  selectionLabel(
    productId: string,
    selection: CartLineDraft['selection'],
  ): string {
    const info = this.productInfo(productId);
    const parts: string[] = [];
    for (const [key, valueId] of Object.entries(selection)) {
      const id = valueId.trim();
      if (!id) continue;
      const option = info?.options.find((item) => item.key === key);
      const valueLabel = option?.values.find((value) => value.id === id)?.label ?? id;
      // Skip raw Firestore ids when the product doc has not loaded yet.
      if (!option && /^[0-9a-f-]{20,}$/i.test(id)) continue;
      parts.push(valueLabel);
    }
    return parts.join(' · ');
  }

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
