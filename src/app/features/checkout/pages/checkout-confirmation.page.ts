import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import {
  cashOnDeliveryEgp,
  hasBankTransferDetails,
  hasInstapayDetails,
  orderStage,
  paymentDue,
  shopperWhatsappText,
  type OrderStage,
} from '@core/config/order-messages';
import { formatIban, STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { FALLBACK_GIFT_NAME } from '@core/services/cart/cart-gifts';
import type { CreateManualOrderResult } from '@core/services/orders/checkout-order.service';
import { orderMessageInput } from '@core/services/orders/order-message-input';
import { shortOrderRef } from '@core/services/orders/order-ref';
import { orderStatusName } from '@core/services/orders/order-status-name';
import { orderDate } from '@core/services/orders/shopper-orders.service';
import {
  isOrderViewKey,
  orderFromView,
  OrderSchema,
  ORDER_VIEWS_COLLECTION,
  ORDERS_COLLECTION,
  OrderViewSchema,
  type OrderDoc,
} from '@core/services/orders/order.schema';
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
import { readGuestOrder, rememberGuestOrder } from '../utils/guest-order-storage';
import { GuestAccountCardComponent } from '../components/guest-account-card/guest-account-card.component';

/**
 * How long a guest's order page waits for `orderViews/{key}` to appear (the `syncOrderView`
 * trigger writes it a moment after the order) before it says the order could not be found.
 */
const VIEW_WAIT_MS = 20_000;

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
    GuestAccountCardComponent,
  ],
  templateUrl: './checkout-confirmation.page.html',
})
export class CheckoutConfirmationPageComponent implements OnInit {
  readonly orderId = input.required<string>();
  /** A guest order's view key from the order link (`?key=`); saved and taken out of the address bar. */
  readonly key = input<string>();

  readonly #router = inject(Router);
  readonly #firestore = injectFirestore();
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  /** Result handed over by checkout; only used for the heading until the live order arrives. */
  readonly seed = signal<CreateManualOrderResult | null>(readNavigationSeed());

  /** The key this browser saved for the order (checkout, or an earlier visit from the link). */
  readonly #savedKey = signal<string | null>(null);

  /**
   * The guest order's view key: from the link, else saved on this device. Null = read the order
   * as its signed-in owner, as before guest checkout.
   */
  readonly viewKey = computed(() => {
    const fromLink = this.key();
    return isOrderViewKey(fromLink) ? fromLink : this.#savedKey();
  });

  /** The email this device placed the guest order with (shown in the account card), if known. */
  readonly guestEmail = signal<string | null>(null);

  readonly orderResource = rxResource({
    params: () => ({ id: this.orderId(), key: this.viewKey() }),
    stream: ({ params }) =>
      params.key ? this.#watchView(params.id, params.key) : this.#watchOrder(params.id),
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

  /** InstaPay instructions: only while the live order still owes money by InstaPay. */
  readonly payBox = computed(() => {
    const input = this.#input();
    const stage = this.stage();
    if (!input || !stage) return null;
    const due = paymentDue(stage, input);
    if (!due || due.reason === 'bank-transfer') return null;
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
   * Bank Transfer instructions (abroad): the amount in the shopper's currency, our bank details
   * with Copy buttons, and Send Receipt on WhatsApp. Only while the live order still owes money.
   */
  readonly bankBox = computed(() => {
    const input = this.#input();
    const stage = this.stage();
    if (!input || !stage) return null;
    const due = paymentDue(stage, input);
    if (due?.reason !== 'bank-transfer') return null;
    const bank = STORE_INFO.payments.bankTransfer;
    const iban = bank.iban.replace(/\s/g, '');
    const reference = this.orderRef().replace(/^#/, '');
    const rows: BankRow[] = [
      { label: 'Account name', value: bank.accountName.trim(), copy: bank.accountName.trim(), mono: false },
      { label: 'IBAN', value: formatIban(iban), copy: iban, mono: true },
      { label: 'SWIFT / BIC', value: bank.swift.trim(), copy: bank.swift.trim(), mono: true },
      { label: 'Bank', value: bank.bankName.trim(), copy: null, mono: false },
      { label: 'Reference', value: reference, copy: reference, mono: true },
    ];
    return {
      amount: due.payIn
        ? formatMoney(due.payIn.amount, due.payIn.currency, displayDecimals(due.payIn.currency))
        : null,
      hasDetails: hasBankTransferDetails(bank),
      rows: rows.filter((row) => row.value !== ''),
      whatsappUrl: whatsappChatUrl(STORE_INFO.contact.whatsapp, shopperWhatsappText(stage, input)),
    };
  });

  /** What is owed now (InstaPay or Bank Transfer), formatted, or null. */
  readonly #payNow = computed(() => this.payBox()?.amount ?? this.bankBox()?.amount ?? null);

  /** A Bank Transfer order's total in the shopper's currency ("$205"), or null for every other order. */
  readonly #payInTotal = computed(() => {
    const order = this.order();
    const payIn = order?.paymentMethod === 'bank-transfer' ? order.pricing.payIn : undefined;
    return payIn ? formatMoney(payIn.amount, payIn.currency, displayDecimals(payIn.currency)) : null;
  });

  /** The "You send by bank" row under the order total: a Bank Transfer in a currency other than EGP. */
  readonly bankSendTotal = computed(() => {
    const payIn = this.order()?.pricing.payIn;
    return payIn && payIn.currency !== 'EGP' ? this.#payInTotal() : null;
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
    if (this.payBox() || this.bankBox()) return whatsappChatUrl(STORE_INFO.contact.whatsapp);
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
      case 'bank-transfer-due':
      case 'cod-free-pending':
        return 'Order Placed';
      case 'cod-confirmed':
        return 'Order Confirmed';
      case 'shipped':
        return 'Order Shipped';
      case 'delivered':
        return 'Order Delivered';
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
      case 'bank-transfer-due':
        return 'Send the total from your bank to finish your order.';
      case 'cod-free-pending':
        return "Nothing to pay now. We'll message you to confirm your order.";
      case 'cod-confirmed':
        return "We're getting your order ready.";
      case 'shipped':
        return this.order()?.paymentMethod === 'cash-on-delivery'
          ? 'Your order is on its way. Please have the cash ready.'
          : 'Your order is on its way.';
      case 'delivered':
        return 'Your order was delivered. Thanks for shopping with us.';
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
    // A Bank Transfer order is paid in the shopper's own currency.
    const total = this.#payInTotal() ?? this.displayTotal();
    const box = (label: string, value: string, now = false) => ({ label, value, now });
    const payNow = this.#payNow();
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
      case 'bank-transfer-due':
        return [payNow ? box('Pay now', payNow, true) : box('Order total', total)];
      case 'shipped':
      case 'cod-free-pending':
      case 'cod-confirmed':
        // Shipped card and InstaPay orders are paid; Cash on Delivery still pays at the door.
        if (stage === 'shipped' && this.order()?.paymentMethod !== 'cash-on-delivery') {
          return [box('Paid', total)];
        }
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
      case 'delivered':
        return [box('Paid', total)];
      default:
        return [box('Order total', total)];
    }
  });

  readonly steps = computed(() => {
    const order = this.order();
    return confirmationSteps(this.stage(), {
      placedAt: stepTime(this.#placed()),
      payNow: this.#payNow(),
      cash: this.#cash(),
      paymentMethod: this.paymentLabel(),
      cashOnDelivery: order?.paymentMethod === 'cash-on-delivery',
      shippedAt: order && 'shippedAt' in order ? stepTime(orderDate(order.shippedAt)) : '',
      deliveredAt: order && 'deliveredAt' in order ? stepTime(orderDate(order.deliveredAt)) : '',
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
      payIn: this.#payInTotal(),
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
    const detailsOf = (labels: readonly { label: string; value: string }[] | undefined): string =>
      (labels ?? []).map((opt) => (isSize(opt.label) ? `Size ${opt.value}` : opt.value)).join(' · ');
    pricing.lines.forEach((line, index) => {
      const imagePath = line.imagePath?.trim() || null;
      if (line.gift) {
        // A row under its item with its photo, joined to the item by a thin line.
        const gift: ConfirmationGift = {
          key: `${index}:${line.productId}`,
          tag: line.gift.giftName || FALLBACK_GIFT_NAME,
          name: line.name || 'Item',
          details: detailsOf(line.optionLabels),
          quantity: line.quantity,
          imagePath,
          imageSrc: imagePath ? normalizeImageKitPath(imagePath) : '',
        };
        const owner = byLine.get(line.gift.forLine) ?? items.at(-1);
        owner?.gifts.push(gift);
        return;
      }
      const item: ConfirmationItem = {
        key: `${index}:${line.productId}`,
        name: line.name || 'Item',
        details: detailsOf(line.optionLabels),
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
    if (isPlatformBrowser(this.#platformId)) {
      const id = this.orderId();
      const memory = readGuestOrder(id);
      const fromLink = this.key();
      if (isOrderViewKey(fromLink)) {
        const saved = rememberGuestOrder(id, { key: fromLink });
        this.#savedKey.set(fromLink);
        // The key opens the order: keep it out of the address bar (and of anything copied from it),
        // but only once it is saved on this device, or a reload would lose the order.
        if (saved) {
          void this.#router.navigate([], {
            queryParams: { key: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
      } else {
        this.#savedKey.set(memory.key);
      }
      this.guestEmail.set(memory.email);
    }
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
      // "IBAN" and "SWIFT / BIC" keep their capitals.
      const name = what === what.toUpperCase() ? what : what.toLowerCase();
      this.#snackbar.info(`Couldn't copy. Please copy the ${name} by hand.`);
    }
  }

  /**
   * A guest order, read live by its key. The view is written a moment after the order, so a
   * missing doc keeps the page loading for up to `VIEW_WAIT_MS` before it counts as not found.
   */
  #watchView(id: string, key: string): Observable<OrderDoc | null | undefined> {
    if (!isPlatformBrowser(this.#platformId)) return of(null);
    // Not `createValibotConverter`: it sets `id` to the doc id (the view key), while the view's
    // own `id` field is the order id that is checked against the route below.
    const ref = doc(this.#firestore, ORDER_VIEWS_COLLECTION, key);
    return new Observable<OrderDoc | null | undefined>((subscriber) => {
      let found = false;
      const timer = setTimeout(() => {
        if (!found) subscriber.next(null);
      }, VIEW_WAIT_MS);
      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            // Once seen, a view that goes away means the order was deleted.
            if (found) subscriber.next(null);
            return;
          }
          const parsed = v.safeParse(OrderViewSchema, snap.data({ serverTimestamps: 'estimate' }));
          if (!parsed.success) {
            subscriber.next(null);
            return;
          }
          const view = parsed.output;
          if (view.id !== id) {
            subscriber.next(null);
            return;
          }
          found = true;
          subscriber.next(orderFromView(view));
        },
        // Unreadable or a bad key: show "could not find".
        () => subscriber.next(null),
      );
      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    });
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

/** One row of the bank details box; `copy` null = no Copy button. */
interface BankRow {
  readonly label: string;
  readonly value: string;
  readonly copy: string | null;
  /** Codes (IBAN, SWIFT, reference) show in a fixed-width font so they are easy to check. */
  readonly mono: boolean;
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
  /** Free gifts that came with this item, shown under it with their photo. */
  readonly gifts: ConfirmationGift[];
}

/** One free gift under its item: photo, product name, options and the gift's name as a tag. */
interface ConfirmationGift {
  readonly key: string;
  /** The gift's name from its offer ("Free shirt"). */
  readonly tag: string;
  readonly name: string;
  /** "Size L", or empty when the gift has no options. */
  readonly details: string;
  readonly quantity: number;
  readonly imagePath: string | null;
  readonly imageSrc: string;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** "2:14 pm, 9 Nov 2026", or empty when the saved date is unreadable. */
function stepTime(date: Date | null | undefined): string {
  return date ? `${TIME_FORMAT.format(date).toLowerCase()}, ${DAY_FORMAT.format(date)}` : '';
}

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
