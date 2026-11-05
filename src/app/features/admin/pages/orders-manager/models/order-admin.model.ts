import type { OrderStage } from '@core/config/order-messages';
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
  /** `#A1B2C3`, the number shoppers see in emails and on the confirmation page. */
  readonly orderRef: string;
  readonly placedAtLabel: string;
  readonly customerName: string;
  readonly country: string;
  readonly status: OrderDoc['status'];
  readonly paymentMethod: OrderDoc['paymentMethod'];
  readonly paymentLabel: string;
  readonly productId: string;
  readonly productName: string;
  readonly selectionLabel: string;
  readonly quantity: number;
  readonly currentStock: number | null;
  readonly stockStatus: OrderLineStockStatus;
  readonly orderTotalLabel: string;
  /** Shopper phone as typed at checkout. */
  readonly phone: string;
  /** What the order may say right now (`orderStage()`). */
  readonly stage: OrderStage;
  /** True on the first line of each order: order actions show there only. */
  readonly isFirstLine: boolean;
  /** WhatsApp chat with the shopper, message already written for this stage. Null = copy the number instead. */
  readonly whatsappUrl: string | null;
  /** Pending cash on delivery ("Confirm order") or InstaPay ("Confirm payment"). */
  readonly confirmAction: 'confirm-order' | 'confirm-payment' | null;
  /** Pending cash on delivery or InstaPay: never paid, safe to cancel. */
  readonly canCancel: boolean;
  /** Money staff should see arrive before confirming, e.g. `EGP 1,500`. Null when nothing is due. */
  readonly amountDueLabel: string | null;
}
