import type { OrderStage } from '@core/config/order-messages';
import type { PaymentMethodId } from '@shared/ui/payment-mark';

/** How the status tag on the Payment card looks: waiting on someone, confirmed, or stopped. */
export type PaymentTagTone = 'waiting' | 'done' | 'stopped';

/** One part of the payment: what it is, how or when, and how much. */
export interface PaymentPart {
  readonly key: string;
  /** Whose mark shows in the small box before the part. */
  readonly mark: PaymentMethodId;
  readonly title: string;
  readonly note: string;
  readonly amount: string;
  /** Already paid: a check before "Paid". */
  readonly paid: boolean;
  /** Nothing will be paid (failed or cancelled): the amount is struck through. */
  readonly struck: boolean;
  /** The amount isn't known yet ("To be agreed"): shown in regular grey text. */
  readonly soft: boolean;
}

export interface PaymentPartsInput {
  readonly method: PaymentMethodId | null;
  /** Order total in the order's currency ("EGP 865"). */
  readonly total: string;
  /** Bank Transfer: the total in the shopper's currency ("$205"), or null. Shown instead of `total`. */
  readonly payIn?: string | null;
  /** Items only, for a large order whose delivery fee is still to be agreed. */
  readonly items: string;
  /** Delivery fee in EGP when it is above 0, else null. */
  readonly fee: string | null;
  /** Cash at the door (total − fee), or null when unknown. */
  readonly cash: string | null;
}

export function paymentTagTone(stage: OrderStage | null): PaymentTagTone {
  switch (stage) {
    case 'cod-confirmed':
    case 'paid':
    case 'paid-needs-review':
    case 'shipped':
    case 'delivered':
      return 'done';
    case 'failed':
    case 'cancelled':
      return 'stopped';
    default:
      return 'waiting';
  }
}

/**
 * The rows of the confirmation page's Payment card for one order stage:
 * one row per part of the payment, so Cash on Delivery shows the delivery fee by InstaPay and
 * the cash at the door apart. Pure; the page passes formatted amounts.
 */
export function paymentParts(stage: OrderStage | null, input: PaymentPartsInput): PaymentPart[] {
  const method = input.method;
  if (!stage || !method) return [];
  const part = (
    key: string,
    mark: PaymentMethodId,
    title: string,
    note: string,
    amount: string,
    flags: Partial<Pick<PaymentPart, 'paid' | 'struck' | 'soft'>> = {},
  ): PaymentPart => ({
    key,
    mark,
    title,
    note,
    amount,
    paid: flags.paid ?? false,
    struck: flags.struck ?? false,
    soft: flags.soft ?? false,
  });
  const cash = input.cash ?? input.total;
  // A Bank Transfer is sent in the shopper's own currency.
  const total = method === 'bank-transfer' && input.payIn ? input.payIn : input.total;

  switch (stage) {
    case 'bank-transfer-due':
      return [part('total', 'bank-transfer', 'Order total', 'Now, from your bank', total)];
    case 'instapay-total-due':
      return [part('total', 'instapay', 'Order total', 'Now, by InstaPay', input.total)];
    case 'instapay-fee-due':
      return [
        part('fee', 'instapay', 'Delivery fee', 'Now, by InstaPay', input.fee ?? '—'),
        part('rest', 'cash-on-delivery', 'The rest', 'In cash at your door', cash),
      ];
    case 'cod-free-pending':
      return [part('total', 'cash-on-delivery', 'Order total', 'In cash at your door', cash)];
    case 'shipped':
    case 'delivered':
      if (method !== 'cash-on-delivery') {
        return [part('total', method, 'Order total', 'Paid', total, { paid: true })];
      }
      if (stage === 'delivered') {
        return input.fee
          ? [
              part('fee', 'instapay', 'Delivery fee', 'Paid', input.fee, { paid: true }),
              part('rest', 'cash-on-delivery', 'The rest', 'Paid in cash', cash, { paid: true }),
            ]
          : [part('total', 'cash-on-delivery', 'Order total', 'Paid in cash', cash, { paid: true })];
      }
      return input.fee
        ? [
            part('fee', 'instapay', 'Delivery fee', 'Paid', input.fee, { paid: true }),
            part('rest', 'cash-on-delivery', 'The rest', 'In cash at your door', cash),
          ]
        : [part('total', 'cash-on-delivery', 'Order total', 'In cash at your door', cash)];
    case 'cod-confirmed':
      return input.fee
        ? [
            part('fee', 'instapay', 'Delivery fee', 'Paid', input.fee, { paid: true }),
            part('rest', 'cash-on-delivery', 'The rest', 'In cash at your door', cash),
          ]
        : [part('total', 'cash-on-delivery', 'Order total', 'In cash at your door', cash)];
    case 'fee-to-be-agreed':
      return [
        part('fee', 'instapay', 'Delivery fee', "We'll agree it on WhatsApp", 'To be agreed', { soft: true }),
        method === 'cash-on-delivery'
          ? part('rest', 'cash-on-delivery', 'The rest', 'In cash at your door', input.items)
          : part('rest', 'instapay', 'Items', 'By InstaPay, with the fee', input.items),
      ];
    case 'paid':
    case 'paid-needs-review':
      return [part('total', method, 'Order total', 'Paid', total, { paid: true })];
    case 'paymob-pending':
      return [part('total', method, 'Order total', 'Checking with your bank', input.total)];
    case 'failed':
      return [part('total', method, 'Order total', 'Not charged', input.total, { struck: true })];
    case 'cancelled':
      return [part('total', method, 'Order total', 'Nothing to pay', total, { struck: true })];
    default:
      return [];
  }
}
