import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { resource } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { CartService } from '@core/services/cart/cart.service';
import { injectFirestore } from '@core/firebase';
import {
  CheckoutOrderService,
  type CheckoutPaymentMethod,
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
    MatRadioModule,
    MatSelectModule,
  ],
  templateUrl: './checkout.page.html',
})
export class CheckoutPageComponent implements OnInit {
  readonly #cart = inject(CartService);
  readonly #checkout = inject(CheckoutOrderService);
  readonly #firestore = injectFirestore();
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly countries = CHECKOUT_COUNTRY_OPTIONS;
  readonly isSubmitting = signal(false);
  readonly paymentMethod = signal<CheckoutPaymentMethod>('paymob');

  readonly shipping = signal<CheckoutShippingInput>({
    fullName: '',
    line1: '',
    line2: null,
    city: '',
    region: null,
    postalCode: '',
    country: 'EG',
    phone: '',
    governorateId: null,
  });

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;
  readonly isEgypt = computed(() => this.shipping().country === 'EG');
  readonly codAvailable = computed(() => this.isEgypt());

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
      description: 'Pay securely with card or wallet, or cash on delivery in Egypt.',
      noindex: true,
    });
    if (this.isEmpty()) {
      void this.#router.navigateByUrl('/');
    }
  }

  patchShipping<K extends keyof CheckoutShippingInput>(key: K, value: CheckoutShippingInput[K]): void {
    this.shipping.update((current) => {
      const next = { ...current, [key]: value };
      if (key === 'country' && value !== 'EG' && this.paymentMethod() === 'cash-on-delivery') {
        this.paymentMethod.set('paymob');
      }
      return next;
    });
  }

  setPaymentMethod(method: CheckoutPaymentMethod): void {
    if (method === 'cash-on-delivery' && !this.codAvailable()) return;
    this.paymentMethod.set(method);
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
    const method = this.paymentMethod();
    if (method === 'cash-on-delivery' && draft.country !== 'EG') {
      this.#snackbar.error('Cash on delivery is only available for Egypt.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      const shipping: CheckoutShippingInput = {
        ...draft,
        fullName: draft.fullName.trim(),
        line1: draft.line1.trim(),
        line2: draft.line2?.trim() || null,
        city: draft.city.trim(),
        region: draft.region?.trim() || null,
        postalCode: draft.postalCode.trim(),
        country: draft.country,
        phone: draft.phone.trim(),
        governorateId: draft.governorateId,
      };

      if (method === 'paymob') {
        const result = await this.#checkout.placePaymobOrder({
          lines: this.lines(),
          shipping,
        });
        this.#cart.clear();
        if (isPlatformBrowser(this.#platformId)) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        await this.#router.navigate(['/checkout', 'confirmation', result.orderId]);
        return;
      }

      const result = await this.#checkout.placeCodOrder({
        lines: this.lines(),
        shipping,
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
