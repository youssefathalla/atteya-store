import type { StatusConfig } from '@shared/ui/status-badge/status.model';

/** Status badge names and colours, shared by the Orders list and the order page. */
export const ORDER_STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: { label: 'Waiting for Payment', color: 'yellow' },
  confirmed: { label: 'Confirmed', color: 'blue' },
  shipped: { label: 'Shipped', color: 'primary' },
  delivered: { label: 'Delivered', color: 'green' },
  failed: { label: 'Payment Failed', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};
