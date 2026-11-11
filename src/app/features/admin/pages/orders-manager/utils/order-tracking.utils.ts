import type { OrderDoc } from '@core/services/orders/order.schema';
import { formatOrderDate } from './order-admin.utils';

export interface TrackingStep {
  readonly key: string;
  readonly label: string;
  /** Date and time it happened; null while it hasn't (or when an older order has no stamp). */
  readonly when: string | null;
  readonly done: boolean;
  /** The step the order is on right now. */
  readonly current: boolean;
}

/**
 * The timeline staff follow: Placed, Confirmed, Shipped, Delivered. A cancelled or failed order ends
 * on that step instead of the ones it never reached. A step back clears the stamp it left, so the
 * step shows as waiting again.
 */
export function trackingSteps(order: OrderDoc): readonly TrackingStep[] {
  const base: { key: string; label: string; raw: unknown }[] = [
    { key: 'placed', label: 'Order Placed', raw: order.createdAt },
    { key: 'confirmed', label: 'Confirmed', raw: order.confirmedAt },
    { key: 'shipped', label: 'Shipped', raw: 'shippedAt' in order ? order.shippedAt : null },
    { key: 'delivered', label: 'Delivered', raw: 'deliveredAt' in order ? order.deliveredAt : null },
  ];
  const steps = base.map((step) => {
    const when = formatOrderDate(step.raw);
    return { key: step.key, label: step.label, when: when || null, done: when !== '', current: false };
  });

  if (order.status === 'cancelled' || order.status === 'failed') {
    const reached = steps.filter((step) => step.done);
    const endLabel = order.status === 'cancelled' ? 'Cancelled' : 'Payment Failed';
    const stamped =
      order.status === 'cancelled' && 'cancelledAt' in order ? formatOrderDate(order.cancelledAt) : '';
    // Failed orders (and older cancelled ones) carry no own stamp: the status was the last change.
    const endWhen = stamped || formatOrderDate(order.updatedAt);
    return [
      ...reached,
      { key: order.status, label: endLabel, when: endWhen || null, done: true, current: true },
    ];
  }

  // The status says how far the order got, even when an older order never got the stamp.
  const statusIndex = STEP_INDEX[order.status] ?? 0;
  const withStatus = steps.map((step, index) => ({ ...step, done: step.done || index <= statusIndex }));
  const lastDone = withStatus.map((step) => step.done).lastIndexOf(true);
  return withStatus.map((step, index) => ({ ...step, current: index === lastDone }));
}

const STEP_INDEX: Partial<Record<OrderDoc['status'], number>> = {
  pending: 0,
  confirmed: 1,
  shipped: 2,
  delivered: 3,
};
