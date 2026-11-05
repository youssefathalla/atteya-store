import type { OrderEmailOrder } from './order-email-model.js';

/**
 * The emails an order can trigger. Each is sent at most once per order
 * (see `orderEmails/{orderId}_{kind}` in the trigger).
 */
export type OrderEmailKind =
  /** Egypt cash on delivery placed: shipping fee first, rest on delivery. */
  | 'cod-placed'
  /** Admin confirmed a cash-on-delivery order (shipping fee received, or free shipping). */
  | 'cod-confirmed'
  /** Paymob payment cleared and the order is confirmed (Egypt or abroad). */
  | 'paid-confirmed'
  /** Paymob reported a failed, voided or refunded payment. */
  | 'payment-failed'
  /** Store-owner alert: a cash-on-delivery order was placed, or an online payment cleared. */
  | 'store-new-order';

/**
 * Decide which emails one order write should send, from the state before and after.
 * Pending Paymob orders send nothing: the shopper may never finish paying.
 */
export function orderEmailsForWrite(
  before: OrderEmailOrder | null,
  after: OrderEmailOrder | null,
): OrderEmailKind[] {
  if (!after) return [];
  const kinds: OrderEmailKind[] = [];
  const statusBefore = before?.status ?? null;
  const becameConfirmed = after.status === 'confirmed' && statusBefore !== 'confirmed';

  if (after.paymentMethod === 'cash-on-delivery') {
    if (before === null && after.status === 'pending') {
      kinds.push('cod-placed', 'store-new-order');
    }
    if (becameConfirmed && statusBefore === 'pending') {
      kinds.push('cod-confirmed');
    }
    return kinds;
  }

  if (becameConfirmed) {
    kinds.push('paid-confirmed', 'store-new-order');
  } else if (after.status === 'failed' && statusBefore !== 'failed') {
    kinds.push('payment-failed');
  }
  return kinds;
}
