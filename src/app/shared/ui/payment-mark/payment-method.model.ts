import type { CheckoutPaymentMethod } from '@core/services/orders/checkout-order.service';

/** A payment method the store offers (the `paymentMethod` value saved on an order). */
export type PaymentMethodId = CheckoutPaymentMethod;

/**
 * How a method is shown: its brand logo, one or two icons from our icon font, or the inline bank
 * drawing (the subset icon font has no bank icon).
 */
export type PaymentMark =
  | { readonly kind: 'logo' }
  | { readonly kind: 'icons'; readonly icons: readonly string[] }
  | { readonly kind: 'bank' };

export interface PaymentMethodInfo {
  /** The method's name, written as a name: "InstaPay", "Card", "Cash on Delivery". */
  readonly name: string;
  readonly mark: PaymentMark;
}

/**
 * Name and mark for each payment method: the one place to add a method. A `logo` mark also
 * needs its file in `public/img/payments/` and a `@case` in `PaymentMarkComponent`.
 */
export const PAYMENT_METHODS: Readonly<Record<PaymentMethodId, PaymentMethodInfo>> = {
  instapay: { name: 'InstaPay', mark: { kind: 'logo' } },
  paymob: {
    name: 'Card',
    mark: { kind: 'icons', icons: ['credit_card'] },
  },
  'cash-on-delivery': { name: 'Cash on Delivery', mark: { kind: 'icons', icons: ['payments'] } },
  'bank-transfer': { name: 'Bank Transfer', mark: { kind: 'bank' } },
};

/** True for a method in `PAYMENT_METHODS` (older orders can hold a method that is gone). */
export function isPaymentMethodId(value: string | null | undefined): value is PaymentMethodId {
  return typeof value === 'string' && Object.hasOwn(PAYMENT_METHODS, value);
}
