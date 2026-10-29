import type { OrderDoc } from '@core/services/orders/order.schema';

export type OrderStatusFilter = 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'all';

export type OrderLineStockStatus = 'in' | 'out' | 'unset' | 'missing';

/** Lean product fields needed to show live stock beside an order line. */
export interface ProductStockLookup {
  readonly id: string;
  readonly name: string;
  readonly stock?: number;
  readonly stockBySize?: Readonly<Record<string, number>>;
  readonly options: readonly {
    readonly key: string;
    readonly label: string;
    readonly values: readonly { readonly id: string; readonly label: string }[];
  }[];
}

export interface OrderLineAdminRow {
  readonly id: string;
  readonly orderId: string;
  readonly placedAtLabel: string;
  readonly customerName: string;
  readonly country: string;
  readonly status: OrderDoc['status'];
  readonly paymentLabel: string;
  readonly productId: string;
  readonly productName: string;
  readonly selectionLabel: string;
  readonly quantity: number;
  readonly currentStock: number | null;
  readonly stockStatus: OrderLineStockStatus;
  readonly orderTotalLabel: string;
}
