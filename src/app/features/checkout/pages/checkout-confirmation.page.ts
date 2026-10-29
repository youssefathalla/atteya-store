import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import type { CreateCodOrderResult } from '@core/services/orders/checkout-order.service';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from '@core/services/orders/order.schema';
import { displayDecimals } from '@core/services/offers/engine';
import { SeoService } from '@core/services/seo';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';

@Component({
  selector: 'app-checkout-confirmation-page',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule],
  templateUrl: './checkout-confirmation.page.html',
})
export class CheckoutConfirmationPageComponent implements OnInit, OnDestroy {
  readonly orderId = input.required<string>();

  readonly #firestore = injectFirestore();
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly seed = signal<CreateCodOrderResult | null>(readNavigationSeed());
  readonly #pollTick = signal(0);
  #pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly orderResource = resource({
    params: () => ({ id: this.orderId(), tick: this.#pollTick() }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const converter = createValibotConverter(OrderSchema);
      const snap = await getDoc(
        doc(this.#firestore, ORDERS_COLLECTION, params.id).withConverter(converter),
      );
      return snap.exists() ? snap.data() : null;
    },
  });

  readonly order = computed<OrderDoc | null>(() => this.orderResource.value() ?? null);
  readonly isPaymob = computed(
    () => (this.order()?.paymentMethod ?? 'paymob') === 'paymob',
  );
  readonly isCod = computed(
    () =>
      this.order()?.paymentMethod === 'cash-on-delivery' ||
      this.seed()?.paymentMethod === 'cash-on-delivery',
  );
  readonly status = computed(
    () => this.order()?.status ?? this.seed()?.status ?? 'pending',
  );

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Order status | Atteya Store',
      description: 'Your Atteya Store order payment status.',
      noindex: true,
    });
    if (isPlatformBrowser(this.#platformId)) {
      this.#pollTimer = setInterval(() => {
        const status = this.status();
        if (status === 'pending' && this.isPaymob()) {
          this.#pollTick.update((n) => n + 1);
        }
      }, 2500);
    }
  }

  ngOnDestroy(): void {
    if (this.#pollTimer) clearInterval(this.#pollTimer);
  }

  displayTotal(): string {
    const pricing = this.order()?.pricing ?? this.seed()?.pricing;
    if (!pricing) return '—';
    return formatMoney(
      pricing.totalDisplay,
      pricing.currency,
      displayDecimals(pricing.currency),
    );
  }

  headline(): string {
    const status = this.status();
    if (this.isCod()) return 'Order placed — pay on delivery';
    if (status === 'confirmed') return 'Payment received';
    if (status === 'failed') return 'Payment did not go through';
    if (status === 'cancelled') return 'Order cancelled';
    return 'Confirming your payment';
  }

  bodyCopy(): string {
    const status = this.status();
    if (this.isCod()) {
      return 'We will prepare your order. Pay cash when it arrives.';
    }
    if (status === 'confirmed') {
      return 'Thanks — your payment is confirmed and we are preparing your order.';
    }
    if (status === 'failed') {
      return 'No charge went through. You can return to checkout and try again.';
    }
    return 'If you just finished paying, this page updates when Paymob confirms the payment.';
  }
}

function readNavigationSeed(): CreateCodOrderResult | null {
  if (typeof history === 'undefined') return null;
  const state = history.state as { checkoutResult?: CreateCodOrderResult };
  return state?.checkoutResult ?? null;
}
