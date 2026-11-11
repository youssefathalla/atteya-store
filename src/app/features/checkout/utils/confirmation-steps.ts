import type { OrderStage } from '@core/config/order-messages';

/** Done = ticked, current = the step the shopper is on now, next = still ahead, stopped = the order ended here. */
export type ConfirmationStepState = 'done' | 'current' | 'next' | 'stopped';

export interface ConfirmationStep {
  readonly key: string;
  readonly title: string;
  readonly note: string;
  readonly state: ConfirmationStepState;
  /** The InstaPay box (address / number, Send on WhatsApp) goes under this step. */
  readonly pay: boolean;
}

export interface ConfirmationStepAmounts {
  /** "2:14 pm, 9 Nov 2026", or empty when the saved date is unreadable. */
  readonly placedAt: string;
  /** What InstaPay asks for now (the fee or the total), e.g. "EGP 135". Null when unreadable. */
  readonly payNow: string | null;
  /** Cash paid at the door, e.g. "EGP 16,449". Null when unreadable. */
  readonly cash: string | null;
  /** Payment method name, e.g. "InstaPay". */
  readonly paymentMethod: string;
  readonly cashOnDelivery: boolean;
  /** "2:14 pm, 10 Nov 2026" when the order was sent (`shippedAt`), or empty. */
  readonly shippedAt?: string;
  /** "2:14 pm, 12 Nov 2026" when the order arrived (`deliveredAt`), or empty. */
  readonly deliveredAt?: string;
}

/** The "What happens next" list for each order stage. Empty for an order we can't explain. */
export function confirmationSteps(
  stage: OrderStage | null,
  amounts: ConfirmationStepAmounts,
): ConfirmationStep[] {
  const placed = step('placed', 'Order placed', amounts.placedAt, 'done');
  const atDoor = step(
    'cash',
    amounts.cash ? `Pay ${amounts.cash} in cash at your door` : 'Pay the rest in cash at your door',
    'Cash on Delivery',
    'next',
  );
  switch (stage) {
    case 'instapay-fee-due':
      return [
        placed,
        step(
          'pay-fee',
          amounts.payNow
            ? `Send the ${amounts.payNow} shipping fee by InstaPay`
            : 'Send the shipping fee by InstaPay',
          'Then send us a screenshot of the transfer.',
          'current',
          true,
        ),
        step('send', 'We send your order', 'As soon as we receive the fee.', 'next'),
        atDoor,
      ];
    case 'instapay-total-due':
      return [
        placed,
        step(
          'pay-total',
          amounts.payNow ? `Send ${amounts.payNow} by InstaPay` : 'Send the total by InstaPay',
          'Then send us a screenshot of the transfer.',
          'current',
          true,
        ),
        step('confirm', 'We confirm your order', 'As soon as we receive your payment.', 'next'),
        step('send', 'We send your order', '', 'next'),
      ];
    case 'fee-to-be-agreed':
      return [
        placed,
        step(
          'agree',
          'We agree the delivery fee with you',
          "It's a large order, so we'll message you on WhatsApp. Once it's agreed, this page shows what to pay.",
          'current',
        ),
        ...(amounts.cashOnDelivery
          ? [
              step('pay', 'Send the delivery fee by InstaPay', '', 'next'),
              step('send', 'We send your order', '', 'next'),
              { ...atDoor, title: 'Pay the rest in cash at your door' },
            ]
          : [
              step('pay', 'Send the total by InstaPay', '', 'next'),
              step('send', 'We send your order', '', 'next'),
            ]),
      ];
    case 'cod-free-pending':
      return [
        placed,
        step(
          'confirm',
          'We confirm your order',
          "Shipping is free, so there's nothing to pay now. We'll message you to confirm.",
          'current',
        ),
        step('send', 'We send your order', '', 'next'),
        atDoor,
      ];
    case 'cod-confirmed':
      return [
        placed,
        step('confirmed', 'Order confirmed', '', 'done'),
        step('send', 'We send your order', "We're getting your order ready.", 'current'),
        { ...atDoor, note: 'Please have it ready when your order arrives.' },
      ];
    case 'paid':
      return [
        placed,
        step('paid', 'Payment received', amounts.paymentMethod, 'done'),
        step('send', 'We send your order', "We're getting your order ready.", 'current'),
        step('delivered', 'Delivered', '', 'next'),
      ];
    case 'shipped': {
      const second = amounts.cashOnDelivery
        ? step('confirmed', 'Order confirmed', '', 'done')
        : step('paid', 'Payment received', amounts.paymentMethod, 'done');
      return [
        placed,
        second,
        step('send', 'Shipped', amounts.shippedAt ?? '', 'done'),
        amounts.cashOnDelivery
          ? { ...atDoor, note: 'Your order is on its way. Please have the cash ready.', state: 'current' }
          : step('delivered', 'Delivered', 'Your order is on its way.', 'current'),
      ];
    }
    case 'delivered': {
      const second = amounts.cashOnDelivery
        ? step('confirmed', 'Order confirmed', '', 'done')
        : step('paid', 'Payment received', amounts.paymentMethod, 'done');
      return [
        placed,
        second,
        step('send', 'Shipped', amounts.shippedAt ?? '', 'done'),
        step('delivered', 'Delivered', amounts.deliveredAt ?? '', 'done'),
      ];
    }
    case 'paid-needs-review':
      return [
        placed,
        step('paid', 'Payment received', amounts.paymentMethod, 'done'),
        step('review', "We'll be in touch about your order", "We'll message you shortly.", 'current'),
      ];
    case 'paymob-pending':
      return [
        placed,
        step(
          'confirming',
          'Confirming your payment',
          'If you just finished paying, this page updates as soon as the payment is confirmed.',
          'current',
        ),
        step('ready', 'We get your order ready', '', 'next'),
      ];
    case 'failed':
      return [
        placed,
        step(
          'failed',
          "Your payment didn't go through",
          "You haven't been charged. If you'd still like these items, please place the order again.",
          'stopped',
        ),
      ];
    case 'cancelled':
      return [placed, step('cancelled', 'Order cancelled', 'This order was cancelled.', 'stopped')];
    default:
      return [];
  }
}

function step(
  key: string,
  title: string,
  note: string,
  state: ConfirmationStepState,
  pay = false,
): ConfirmationStep {
  return { key, title, note, state, pay };
}
