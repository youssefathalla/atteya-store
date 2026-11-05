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
import { shortOrderRef } from '@core/services/orders/order-ref';
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

  /** `#A1B2C3`, the same number the order emails use. */
  readonly orderRef = computed(() => shortOrderRef(this.orderId()));

  /**
   * Cash on delivery amounts in whole EGP, from the saved order. The shipping fee is
   * collected first (usually on WhatsApp); the rest is paid in cash on delivery.
   * Same split as the order emails (`functions/src/email/order-email-templates.ts`).
   */
  readonly codAmounts = computed(() => {
    const pricing = this.order()?.pricing ?? this.seed()?.pricing;
    if (!pricing) return null;
    const shippingEgp = pricing.shipping?.priceEgp ?? 0;
    const totalEgp = pricing.totalEgp ?? pricing.subtotalEgp + shippingEgp;
    return {
      shippingEgp,
      shipping: formatMoney(shippingEgp, 'EGP', 0),
      cash: formatMoney(Math.max(0, totalEgp - shippingEgp), 'EGP', 0),
    };
  });

  headline(): string {
    const status = this.status();
    if (status === 'cancelled') return 'Order cancelled';
    if (this.isCod()) return status === 'confirmed' ? 'Order confirmed' : 'Order placed';
    if (status === 'confirmed') return 'Payment received';
    if (status === 'failed') return "Your payment didn't go through";
    return 'Confirming your payment';
  }

  bodyCopy(): string {
    const status = this.status();
    if (status === 'cancelled') return 'This order was cancelled.';
    if (this.isCod()) {
      const amounts = this.codAmounts();
      if (!amounts) return "We'll contact you, usually on WhatsApp, to confirm your order.";
      if (status === 'confirmed') {
        return `Your order is confirmed and we're getting it ready. Please have ${amounts.cash} in cash ready when it arrives.`;
      }
      return amounts.shippingEgp > 0
        ? `We'll contact you, usually on WhatsApp, to collect the shipping fee of ${amounts.shipping}. Once it's paid, we'll send your order, and you'll pay the rest, ${amounts.cash}, in cash when it arrives.`
        : `We'll contact you, usually on WhatsApp, to confirm your order. Shipping is free, so you'll pay ${amounts.cash} in cash when it arrives.`;
    }
    if (status === 'confirmed') {
      return "Thanks, your payment is confirmed and we're getting your order ready.";
    }
    if (status === 'failed') {
      return "You haven't been charged. If you'd still like these items, please place the order again.";
    }
    return 'If you just finished paying, this page updates when Paymob confirms the payment.';
  }
}

function readNavigationSeed(): CreateCodOrderResult | null {
  if (typeof history === 'undefined') return null;
  const state = history.state as { checkoutResult?: CreateCodOrderResult };
  return state?.checkoutResult ?? null;
}
