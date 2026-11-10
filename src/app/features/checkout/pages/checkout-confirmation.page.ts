import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { FALLBACK_GIFT_NAME, giftLineLabel } from '@core/services/cart/cart-gifts';
import type { CreateManualOrderResult } from '@core/services/orders/checkout-order.service';
import { orderMessageInput } from '@core/services/orders/order-message-input';
import { shortOrderRef } from '@core/services/orders/order-ref';
import { orderStatusName } from '@core/services/orders/order-status-name';
import { orderDate } from '@core/services/orders/shopper-orders.service';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from '@core/services/orders/order.schema';
import { dealTag, displayDecimals } from '@core/services/offers/engine';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { isPaymentMethodId, PAYMENT_METHODS, PaymentMarkComponent } from '@shared/ui/payment-mark';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { WHATSAPP_ICON_PATH } from '@shared/utils/brand-icons';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import { confirmationSteps } from '../utils/confirmation-steps';
import { paymentParts as buildPaymentParts, paymentTagTone } from '../utils/confirmation-payment';

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
  imports: [
    RouterLink,
    NgOptimizedImage,
    AppImageFallbackDirective,
    MatButtonModule,
    MatButtonToggleModule,
    SharedIconModule,
    PaymentMarkComponent,
  ],
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

  /** Which InstaPay value the box shows when both are set: the phone number first. Not remembered. */
  readonly instapayWay = signal<'number' | 'address'>('number');

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
      whatsappUrl: whatsappChatUrl(STORE_INFO.contact.whatsapp, shopperWhatsappText(stage, input, info)),
    };
  });

  /**
   * "Questions? Message us" button. While InstaPay is due the Send on WhatsApp button already
   * carries the payment message, so this one opens a plain chat. Hidden while a card payment is
   * settling (no ready-made message for that stage).
   */
  readonly helpUrl = computed(() => {
    const input = this.#input();
    const stage = this.stage();
    if (!input || !stage) return null;
    if (this.payBox()) return whatsappChatUrl(STORE_INFO.contact.whatsapp);
    const text = shopperWhatsappText(stage, input);
    return text ? whatsappChatUrl(STORE_INFO.contact.whatsapp, text) : null;
  });

  readonly whatsappIconPath = WHATSAPP_ICON_PATH;

  readonly #cash = computed(() => {
    const input = this.#input();
    const cash = input ? cashOnDeliveryEgp(input) : null;
    return cash !== null ? formatMoney(cash, 'EGP', 0) : null;
  });

  readonly headline = computed(() => {
    switch (this.stage()) {
      case 'fee-to-be-agreed':
      case 'instapay-total-due':
      case 'instapay-fee-due':
      case 'cod-free-pending':
        return 'Order Placed';
      case 'cod-confirmed':
        return 'Order Confirmed';
      case 'paid':
      case 'paid-needs-review':
        return 'Payment Received';
      case 'paymob-pending':
        return 'Confirming Your Payment';
      case 'failed':
        return "Your Payment Didn't Go Through";
      case 'cancelled':
        return 'Order Cancelled';
      default:
        return this.seed() ? 'Order Placed' : 'Your Order';
    }
  });

  /** One short line under the heading; the steps below say the rest. */
  readonly bandLine = computed(() => {
    switch (this.stage()) {
      case 'fee-to-be-agreed':
        return "We'll message you on WhatsApp to agree the delivery fee.";
      case 'instapay-total-due':
        return 'One step left: send your payment.';
      case 'instapay-fee-due':
        return 'One step left: send the shipping fee.';
      case 'cod-free-pending':
        return "Nothing to pay now. We'll message you to confirm your order.";
      case 'cod-confirmed':
        return "We're getting your order ready.";
      case 'paid':
        return "Thanks, your payment is confirmed and we're getting your order ready.";
      case 'paid-needs-review':
        return "Thanks, your payment is confirmed. We'll be in touch about your order shortly.";
      case 'paymob-pending':
        return 'This page updates as soon as the payment is confirmed.';
      case 'failed':
        return "You haven't been charged.";
      case 'cancelled':
        return 'This order was cancelled.';
      default:
        return '';
    }
  });

  /** "Order #A1B2C3 · 9 Nov 2026" in the band. */
  readonly #placed = computed(() => orderDate(this.order()?.createdAt));

  readonly placedOn = computed(() => {
    const date = this.#placed();
    return date ? DAY_FORMAT.format(date) : '';
  });

  /**
   * The money boxes in the band: what the order costs, what to pay now (white, so it stands out)
   * and what's left for the door. Only the ones that apply to this stage.
   */
  readonly moneyBoxes = computed(() => {
    const pricing = this.order()?.pricing;
    const stage = this.stage();
    if (!pricing || !stage) return [];
    const total = this.displayTotal();
    const box = (label: string, value: string, now = false) => ({ label, value, now });
    const payNow = this.payBox()?.amount ?? null;
    const cash = this.#cash();
    switch (stage) {
      case 'instapay-fee-due':
        return [
          box('Order total', total),
          ...(payNow ? [box('Pay now', payNow, true)] : []),
          ...(cash ? [box('At your door', cash)] : []),
        ];
      // The whole total is due now, so one box says it.
      case 'instapay-total-due':
        return [payNow ? box('Pay now', payNow, true) : box('Order total', total)];
      case 'cod-free-pending':
      case 'cod-confirmed':
        // With free shipping the cash at the door is the total: one box.
        return cash && cash !== total
          ? [box('Order total', total), box('At your door', cash)]
          : [box('At your door', cash ?? total)];
      case 'fee-to-be-agreed':
        return [
          box(
            'Items',
            formatMoney(pricing.subtotalDisplay, pricing.currency, displayDecimals(pricing.currency)),
          ),
          box('Delivery fee', 'To be agreed'),
        ];
      case 'paid':
      case 'paid-needs-review':
        return [box('Paid', total)];
      default:
        return [box('Order total', total)];
    }
  });

  readonly steps = computed(() => {
    const date = this.#placed();
    return confirmationSteps(this.stage(), {
      placedAt: date ? `${TIME_FORMAT.format(date).toLowerCase()}, ${DAY_FORMAT.format(date)}` : '',
      payNow: this.payBox()?.amount ?? null,
      cash: this.#cash(),
      paymentMethod: this.paymentLabel(),
      cashOnDelivery: this.order()?.paymentMethod === 'cash-on-delivery',
    });
  });

  /** The order's payment method when it is one we still offer (its mark shows next to the name). */
  readonly paymentMethod = computed(() => {
    const method = this.order()?.paymentMethod;
    return isPaymentMethodId(method) ? method : null;
  });

  readonly paymentLabel = computed(() => {
    const method = this.paymentMethod();
    if (method) return PAYMENT_METHODS[method].name;
    return this.order()?.paymentMethod === 'international-bank-transfer' ? 'Bank Transfer' : '—';
  });

  /** The Payment card: one row per part of the payment (the fee by InstaPay, the cash at the door). */
  readonly paymentParts = computed(() => {
    const pricing = this.order()?.pricing;
    const input = this.#input();
    if (!pricing || !input) return [];
    const fee =
      input.shippingEgp !== null && input.shippingEgp > 0 ? formatMoney(input.shippingEgp, 'EGP', 0) : null;
    return buildPaymentParts(this.stage(), {
      method: this.paymentMethod(),
      total: formatMoney(pricing.totalDisplay, pricing.currency, displayDecimals(pricing.currency)),
      items: formatMoney(pricing.subtotalDisplay, pricing.currency, displayDecimals(pricing.currency)),
      fee,
      cash: this.#cash(),
    });
  });

  readonly paymentTone = computed(() => paymentTagTone(this.stage()));

  readonly statusLabel = computed(() => orderStatusName(this.stage(), this.order()?.status ?? '—'));

  /**
   * What was ordered, from the saved order lines. Free gifts follow the item they came with and
   * show "Free" instead of a price; a Buy X Get Y discount shows its tag and the old price.
   */
  readonly items = computed<ConfirmationItem[]>(() => {
    const pricing = this.order()?.pricing;
    if (!pricing) return [];
    const decimals = displayDecimals(pricing.currency);
    const isSize = (label: string) => label.trim().toLowerCase() === 'size';
    const items: ConfirmationItem[] = [];
    const byLine = new Map<number, ConfirmationItem>();
    pricing.lines.forEach((line, index) => {
      if (line.gift) {
        // One line under its item, like the bag: "Free shirt: Adidas Simple Polo, L".
        const size = (line.optionLabels ?? []).find((opt) => isSize(opt.label))?.value ?? null;
        const gift = {
          key: `${index}:${line.productId}`,
          label: giftLineLabel(line.gift.giftName || FALLBACK_GIFT_NAME, line.name || 'Item', size),
          quantity: line.quantity,
        };
        const owner = byLine.get(line.gift.forLine) ?? items.at(-1);
        owner?.gifts.push(gift);
        return;
      }
      const imagePath = line.imagePath?.trim() || null;
      const item: ConfirmationItem = {
        key: `${index}:${line.productId}`,
        name: line.name || 'Item',
        details: (line.optionLabels ?? [])
          .map((opt) => (isSize(opt.label) ? `Size ${opt.value}` : opt.value))
          .join(' · '),
        quantity: line.quantity,
        imagePath,
        imageSrc: imagePath ? normalizeImageKitPath(imagePath) : '',
        price: formatMoney(line.lineDisplay, pricing.currency, decimals),
        // Buy X Get Y: "Free" / "−50%" and the price before it.
        deal: line.deals?.length ? dealTag(line.deals, line.quantity) : '',
        was:
          (line.discountEgp ?? 0) > 0
            ? formatMoney(line.fullEgp ?? line.unitDisplay * line.quantity, pricing.currency, decimals)
            : '',
        gifts: [],
      };
      items.push(item);
      byLine.set(index, item);
    });
    return items;
  });

  /** "6 items": pieces, like the bag. */
  readonly pieces = computed(() => {
    const count = (this.order()?.pricing.lines ?? [])
      .filter((line) => !line.gift)
      .reduce((sum, line) => sum + line.quantity, 0);
    return `${count} ${count === 1 ? 'item' : 'items'}`;
  });

  readonly subtotal = computed(() => {
    const pricing = this.order()?.pricing;
    return pricing
      ? formatMoney(pricing.subtotalDisplay, pricing.currency, displayDecimals(pricing.currency))
      : '—';
  });

  readonly shippingLabel = computed(() => {
    const pricing = this.order()?.pricing;
    if (!pricing?.shipping) return '—';
    if (this.stage() === 'fee-to-be-agreed') return 'To be agreed';
    if (pricing.shipping.priceDisplay === 0) return 'Free';
    return formatMoney(pricing.shipping.priceDisplay, pricing.currency, displayDecimals(pricing.currency));
  });

  /** Name, address lines and phone as saved on the order. */
  readonly delivery = computed(() => {
    const shipping = this.order()?.shipping;
    if (!shipping) return null;
    const cityLine = [shipping.city, shipping.region, shipping.postalCode]
      .filter((part) => !!part?.trim())
      .join(', ');
    const country = shipping.country === 'EG' ? '' : countryName(shipping.country);
    return {
      name: shipping.fullName,
      lines: [shipping.line1, shipping.line2 ?? '', cityLine, country].filter((part) => part.trim() !== ''),
      phone: shipping.phone,
    };
  });

  readonly displayTotal = computed(() => {
    const pricing = this.order()?.pricing;
    if (!pricing) return '—';
    const total = formatMoney(pricing.totalDisplay, pricing.currency, displayDecimals(pricing.currency));
    return this.stage() === 'fee-to-be-agreed' ? `${total} + shipping` : total;
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

interface ConfirmationItem {
  readonly key: string;
  readonly name: string;
  /** Chosen options, e.g. "Black · Size M"; empty when the product has none. */
  readonly details: string;
  readonly quantity: number;
  readonly imagePath: string | null;
  readonly imageSrc: string;
  readonly price: string;
  readonly deal: string;
  readonly was: string;
  /** Free gifts that came with this item ("Free shirt: Adidas Simple Polo, L"). */
  readonly gifts: { readonly key: string; readonly label: string; readonly quantity: number }[];
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function readNavigationSeed(): CreateManualOrderResult | null {
  if (typeof history === 'undefined') return null;
  const state = history.state as { checkoutResult?: CreateManualOrderResult };
  return state?.checkoutResult ?? null;
}
