import type { OrderDoc } from '@core/services/orders/order.schema';
import { formatOrderDate } from './order-admin.utils';

export interface TrackingStep {
  readonly key: string;
  readonly label: string;
  /** Date and time it happened; null while it hasn't. */
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
    const endWhen =
      order.status === 'cancelled' && 'cancelledAt' in order ? formatOrderDate(order.cancelledAt) : '';
    return [
      ...reached,
      { key: order.status, label: endLabel, when: endWhen || null, done: true, current: true },
    ];
  }

  const lastDone = steps.map((step) => step.done).lastIndexOf(true);
  return steps.map((step, index) => ({ ...step, current: index === lastDone }));
}
