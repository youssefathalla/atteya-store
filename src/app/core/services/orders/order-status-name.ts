import type { OrderStage } from '@core/config/order-messages';

/**
 * The order status name a shopper sees (confirmation page, Account → Orders, account panel).
 * Title case, like every status name. `fallback` is the raw status when the stage is unknown.
 */
export function orderStatusName(stage: OrderStage | null, fallback = '—'): string {
  switch (stage) {
    case 'fee-to-be-agreed':
      return 'Waiting for Delivery Fee';
    case 'instapay-total-due':
    case 'instapay-fee-due':
    case 'bank-transfer-due':
      return 'Waiting for Payment';
    case 'cod-free-pending':
      return 'Waiting for Confirmation';
    case 'cod-confirmed':
    case 'paid':
    case 'paid-needs-review':
      return 'Confirmed';
    case 'paymob-pending':
      return 'Confirming Payment';
    case 'failed':
      return 'Payment Failed';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return fallback;
  }
}
