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
  /** Egypt InstaPay placed: transfer the full total, send the screenshot on WhatsApp. */
  | 'instapay-placed'
  /** Admin confirmed an InstaPay order (transfer seen in the bank app). */
  | 'instapay-confirmed'
  /** Large Egypt order (InstaPay or cash on delivery): staff saved the agreed delivery fee. */
  | 'delivery-fee-set'
  /**
   * Staff changed that fee while the order was still open. Sent on every change (the trigger
   * claims it per save, not once per order).
   */
  | 'delivery-fee-changed'
  /** Paymob payment cleared and the order is confirmed (Egypt or abroad). */
  | 'paid-confirmed'
  /** Paymob reported a failed, voided or refunded payment. */
  | 'payment-failed'
  /** Staff marked the order as Shipped (first time only; a step back and forward again sends nothing). */
  | 'order-shipped'
  /** Staff marked the order as Delivered (first time only). */
  | 'order-delivered'
  /** Store-owner alert: a cash-on-delivery or InstaPay order was placed, or a card payment cleared. */
  | 'store-new-order';

/**
 * `orderEmails` document id: one per (order, email), except `delivery-fee-changed`, which is
 * sent on every change, so it is claimed per save (`deliveryFeeSetAt`, else the new fee).
 */
export function claimId(kind: OrderEmailKind, order: OrderEmailOrder): string {
  if (kind === 'delivery-fee-changed') {
    return `${order.id}_${kind}_${order.deliveryFeeSetAtMs ?? order.shippingEgp}`;
  }
  return `${order.id}_${kind}`;
}

/**
 * Decide which emails one order write should send, from the state before and after.
 * Pending Paymob orders send nothing: the shopper may never finish paying.
 * Cancelling sends nothing: staff talk to the shopper on WhatsApp.
 * Shipped and Delivered each send one email the first time the order reaches them (any payment
 * method); the `orderEmails/{orderId}_{kind}` claim stops a resend after a step back.
 * A step back to Confirmed (from Shipped) never sends a confirmation again.
 */
export function orderEmailsForWrite(
  before: OrderEmailOrder | null,
  after: OrderEmailOrder | null,
): OrderEmailKind[] {
  if (!after) return [];
  const kinds: OrderEmailKind[] = [];
  const statusBefore = before?.status ?? null;
  if (after.status === 'shipped' && statusBefore !== 'shipped' && statusBefore !== 'delivered') {
    return ['order-shipped'];
  }
  if (after.status === 'delivered' && statusBefore !== 'delivered') {
    return ['order-delivered'];
  }
  if (statusBefore === 'shipped' || statusBefore === 'delivered') return [];
  const becameConfirmed = after.status === 'confirmed' && statusBefore !== 'confirmed';
  const open = after.status === 'pending';
  const feeJustSet = before !== null && before.feeToBeAgreed && !after.feeToBeAgreed && open;
  // A later change to the agreed fee (a different amount) while the order is still open.
  const feeChanged =
    before !== null &&
    open &&
    before.deliveryFeeAgreed &&
    after.deliveryFeeAgreed &&
    before.shippingEgp !== after.shippingEgp;

  if (after.paymentMethod === 'cash-on-delivery') {
    if (before === null && after.status === 'pending') {
      kinds.push('cod-placed', 'store-new-order');
    }
    if (feeJustSet) kinds.push('delivery-fee-set');
    if (feeChanged) kinds.push('delivery-fee-changed');
    if (becameConfirmed && statusBefore === 'pending') {
      kinds.push('cod-confirmed');
    }
    return kinds;
  }

  if (after.paymentMethod === 'instapay') {
    if (before === null && after.status === 'pending') {
      kinds.push('instapay-placed', 'store-new-order');
    }
    if (feeJustSet) kinds.push('delivery-fee-set');
    if (feeChanged) kinds.push('delivery-fee-changed');
    if (becameConfirmed && statusBefore === 'pending') {
      kinds.push('instapay-confirmed');
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
