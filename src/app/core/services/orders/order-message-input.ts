import type { OrderMessageInput } from '@core/config/order-messages';
import { shortOrderRef } from './order-ref';
import type { OrderDoc } from './order.schema';

/**
 * Saved order → the facts `orderStage()` / `paymentDue()` / WhatsApp texts read
 * (`@core/config/order-messages`). Amounts come only from the saved order: an unreadable
 * amount stays null so no message guesses one.
 */
export function orderMessageInput(order: OrderDoc): OrderMessageInput {
  const pricing = order.pricing;
  const shippingEgp = pricing.shipping ? pricing.shipping.priceEgp : null;
  const totalEgp =
    typeof pricing.totalEgp === 'number'
      ? pricing.totalEgp
      : shippingEgp !== null
        ? pricing.subtotalEgp + shippingEgp
        : null;
  return {
    ref: shortOrderRef(order.id),
    paymentMethod: order.paymentMethod,
    status: order.status,
    country: order.shipping.country,
    shippingEgp,
    totalEgp,
    needsReview: 'needsReview' in order ? order.needsReview === true : false,
  };
}
