import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { resource } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import {
  CheckoutOrderService,
  type CheckoutShippingInput,
} from '@core/services/orders/checkout-order.service';
import { ProductSchema } from '@core/services/products/product.schema';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { CHECKOUT_COUNTRY_OPTIONS } from '../utils/checkout-countries';

@Component({
  selector: 'app-checkout-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './checkout.page.html',
})
export class CheckoutPageComponent implements OnInit {
  readonly #cart = inject(CartService);
  readonly #currency = inject(CurrencyService);
  readonly currency = this.#currency;
  readonly #checkout = inject(CheckoutOrderService);
  readonly #firestore = injectFirestore();
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly countries = CHECKOUT_COUNTRY_OPTIONS;
  readonly isSubmitting = signal(false);

  readonly shipping = signal<CheckoutShippingInput>({
    fullName: '',
    line1: '',
    line2: null,
    city: '',
    region: null,
    postalCode: '',
    country: 'GB',
    phone: '',
  });

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;

  readonly productsResource = resource({
    params: () => this.lines(),
    loader: async ({ params: lines }) => {
      if (!isPlatformBrowser(this.#platformId) || lines.length === 0) {
        return new Map<string, string>();
      }
      const converter = createValibotConverter(ProductSchema);
      const names = new Map<string, string>();
      const seen = new Set<string>();
      for (const line of lines) {
        if (seen.has(line.productId)) continue;
        seen.add(line.productId);
        const snap = await getDoc(
          doc(this.#firestore, 'products', line.productId).withConverter(converter),
        );
        if (snap.exists()) names.set(line.productId, snap.data().name);
      }
      return names;
    },
  });

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Checkout | Atteya Store',
      description: 'Complete your international order with a bank transfer.',
      noindex: true,
    });
    if (this.isEmpty()) {
      void this.#router.navigateByUrl('/');
    }
  }

  patchShipping<K extends keyof CheckoutShippingInput>(key: K, value: CheckoutShippingInput[K]): void {
    this.shipping.update((current) => ({ ...current, [key]: value }));
  }

  productName(productId: string): string {
    return this.productsResource.value()?.get(productId) ?? 'Item';
  }

  async placeOrder(): Promise<void> {
    if (this.isSubmitting() || this.isEmpty()) return;
    const draft = this.shipping();
    if (!draft.fullName.trim() || !draft.line1.trim() || !draft.city.trim() || !draft.postalCode.trim()) {
      this.#snackbar.error('Fill in your delivery address to continue.');
      return;
    }
    if (!draft.phone.trim()) {
      this.#snackbar.error('Add a phone number we can reach you on.');
      return;
    }
    this.isSubmitting.set(true);
    try {
      const result = await this.#checkout.placeInternationalBankTransferOrder({
        lines: this.lines(),
        shipping: {
          ...draft,
          fullName: draft.fullName.trim(),
          line1: draft.line1.trim(),
          line2: draft.line2?.trim() || null,
          city: draft.city.trim(),
          region: draft.region?.trim() || null,
          postalCode: draft.postalCode.trim(),
          country: draft.country,
          phone: draft.phone.trim(),
        },
        currency: this.#currency.selected(),
      });
      this.#cart.clear();
      await this.#router.navigate(['/checkout', 'confirmation', result.orderId], {
        state: { checkoutResult: result },
      });
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'We could not place your order. Try again in a moment.';
      this.#snackbar.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
