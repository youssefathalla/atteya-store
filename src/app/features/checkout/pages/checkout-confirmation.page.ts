import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { injectFirestore } from '@core/firebase';
import {
  cashOnDeliveryEgp,
  hasInstapayDetails,
  orderStage,
  paymentDue,
  shopperWhatsappText,
  type OrderStage,
} from '@core/config/order-messages';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import type { CreateManualOrderResult } from '@core/services/orders/checkout-order.service';
import { orderMessageInput } from '@core/services/orders/order-message-input';
import { shortOrderRef } from '@core/services/orders/order-ref';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from '@core/services/orders/order.schema';
import { displayDecimals } from '@core/services/offers/engine';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';

/**
 * Order status after checkout. The order is read live, so the page changes by itself when
 * Paymob confirms a payment or staff confirm or cancel an order.
 *
 * Everything payment-specific (InstaPay box, screenshot button) comes from `orderStage()` /
 * `paymentDue()` on the LIVE order only, never from defaults or the navigation seed, so a
 * paid order never flashes a request for money.
 */
@Component({
  selector: 'app-checkout-confirmation-page',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './checkout-confirmation.page.html',
})
export class CheckoutConfirmationPageComponent implements OnInit {
  readonly orderId = input.required<string>();

  readonly #firestore = injectFirestore();
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  /** Result handed over by checkout; only used for the heading until the live order arrives. */
  readonly seed = signal<CreateManualOrderResult | null>(readNavigationSeed());

  readonly orderResource = rxResource({
    params: () => this.orderId(),
    stream: ({ params: id }) => this.#watchOrder(id),
  });

  /** undefined = still loading; null = not found (or not this shopper's order). */
  readonly order = computed<OrderDoc | null | undefined>(() =>
    this.orderResource.error() ? null : this.orderResource.value(),
  );

  readonly #input = computed(() => {
    const order = this.order();
    return order ? orderMessageInput(order) : null;
  });

  /** Null until the live order has loaded. */
  readonly stage = computed<OrderStage | null>(() => {
    const input = this.#input();
    return input ? orderStage(input) : null;
  });

  readonly orderRef = computed(() => shortOrderRef(this.orderId()));

  /** InstaPay instructions: only while the live order still owes money. */
  readonly payBox = computed(() => {
    const input = this.#input();
    const stage = this.stage();
    if (!input || !stage) return null;
    const due = paymentDue(stage, input);
    if (!due) return null;
    const info = STORE_INFO.payments.instapay;
    return {
      reason: due.reason,
      amount: due.amountEgp !== null ? formatMoney(due.amountEgp, 'EGP', 0) : null,
      hasDetails: hasInstapayDetails(info),
      address: info.address.trim(),
      number: info.number.trim(),
      whatsappUrl: whatsappChatUrl(
        STORE_INFO.contact.whatsapp,
        shopperWhatsappText(stage, input, info),
      ),
    };
  });

  /** Quiet "Questions?" link for every other stage, except while a card payment is settling. */
  readonly helpUrl = computed(() => {
    const input = this.#input();
    const stage = this.stage();
    if (!input || !stage || this.payBox()) return null;
    const text = shopperWhatsappText(stage, input);
    return text ? whatsappChatUrl(STORE_INFO.contact.whatsapp, text) : null;
  });

  readonly #cash = computed(() => {
    const input = this.#input();
    const cash = input ? cashOnDeliveryEgp(input) : null;
    return cash !== null ? formatMoney(cash, 'EGP', 0) : null;
  });

  readonly headline = computed(() => {
    switch (this.stage()) {
      case 'instapay-total-due':
      case 'instapay-fee-due':
      case 'cod-free-pending':
        return 'Order placed';
      case 'cod-confirmed':
        return 'Order confirmed';
      case 'paid':
      case 'paid-needs-review':
        return 'Payment received';
      case 'paymob-pending':
        return 'Confirming your payment';
      case 'failed':
        return "Your payment didn't go through";
      case 'cancelled':
        return 'Order cancelled';
      default:
        return this.seed() ? 'Order placed' : 'Your order';
    }
  });

  readonly bodyCopy = computed(() => {
    const cash = this.#cash();
    switch (this.stage()) {
      case 'instapay-total-due':
        return "One more step: pay by InstaPay and send us the screenshot. We'll confirm your order as soon as the money arrives.";
      case 'instapay-fee-due':
        return cash
          ? `One more step: pay the shipping fee by InstaPay and send us the screenshot. Then we'll send your order, and you'll pay the rest, ${cash}, in cash when it arrives.`
          : "One more step: pay the shipping fee by InstaPay and send us the screenshot. Then we'll send your order.";
      case 'cod-free-pending':
        return `Shipping is free, so there's nothing to pay now. We'll message you to confirm your order, and you'll pay ${cash ?? 'the total'} in cash when it arrives.`;
      case 'cod-confirmed':
        return `Your order is confirmed and we're getting it ready. Please have ${cash ?? 'the rest'} in cash ready when it arrives.`;
      case 'paid':
        return "Thanks, your payment is confirmed and we're getting your order ready.";
      case 'paid-needs-review':
        return "Thanks, your payment is confirmed. We'll be in touch about your order shortly.";
      case 'paymob-pending':
        return 'If you just finished paying, this page updates as soon as the payment is confirmed.';
      case 'failed':
        return "You haven't been charged. If you'd still like these items, please place the order again.";
      case 'cancelled':
        return 'This order was cancelled.';
      default:
        return '';
    }
  });

  readonly paymentLabel = computed(() => {
    switch (this.order()?.paymentMethod) {
      case 'instapay':
        return 'InstaPay';
      case 'cash-on-delivery':
        return 'Cash on delivery';
      case 'paymob':
        return 'Card or wallet';
      case 'international-bank-transfer':
        return 'Bank transfer';
      default:
        return '—';
    }
  });

  readonly statusLabel = computed(() => {
    switch (this.stage()) {
      case 'instapay-total-due':
      case 'instapay-fee-due':
        return 'Waiting for payment';
      case 'cod-free-pending':
        return 'Waiting for confirmation';
      case 'cod-confirmed':
      case 'paid':
      case 'paid-needs-review':
        return 'Confirmed';
      case 'paymob-pending':
        return 'Confirming payment';
      case 'failed':
        return 'Payment failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return this.order()?.status ?? '—';
    }
  });

  readonly displayTotal = computed(() => {
    const pricing = this.order()?.pricing;
    if (!pricing) return '—';
    return formatMoney(pricing.totalDisplay, pricing.currency, displayDecimals(pricing.currency));
  });

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Order status | Atteya Store',
      description: 'Your Atteya Store order status.',
      noindex: true,
    });
  }

  async copy(value: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.#snackbar.success(`${what} copied.`);
    } catch {
      this.#snackbar.info(`Couldn't copy. Please copy the ${what.toLowerCase()} by hand.`);
    }
  }

  #watchOrder(id: string): Observable<OrderDoc | null> {
    if (!isPlatformBrowser(this.#platformId)) return of(null);
    const ref = doc(this.#firestore, ORDERS_COLLECTION, id).withConverter(
      createValibotConverter(OrderSchema),
    );
    return new Observable<OrderDoc | null>((subscriber) =>
      onSnapshot(
        ref,
        (snap) => subscriber.next(snap.exists() ? snap.data() : null),
        // Not found, not this shopper's order, or unreadable: show "could not find".
        () => subscriber.next(null),
      ),
    );
  }
}

function readNavigationSeed(): CreateManualOrderResult | null {
  if (typeof history === 'undefined') return null;
  const state = history.state as { checkoutResult?: CreateManualOrderResult };
  return state?.checkoutResult ?? null;
}
