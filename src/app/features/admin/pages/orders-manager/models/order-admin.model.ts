import type { OrderStage } from '@core/config/order-messages';
import type { StaffOrderStatus } from '@core/config/order-status';
import type { OrderDoc } from '@core/services/orders/order.schema';

export type OrderStatusFilter = OrderDoc['status'] | 'all';

/** One choice in the status dropdown. */
export interface OrderStatusMove {
  readonly status: StaffOrderStatus;
  /** "Shipped", or "Back to Confirmed" for a step back. */
  readonly label: string;
}

/** One saved status change, ready to show. */
export interface OrderHistoryEntry {
  readonly label: string;
  readonly when: string;
  /** Staff email, else uid. */
  readonly by: string;
  readonly reason: string | null;
}

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
  /** When the order last changed (status, fee, payment), e.g. `11/11/2026, 2:14:00 PM`. */
  readonly updatedAtLabel: string;
  readonly customerName: string;
  readonly country: string;
  readonly status: OrderDoc['status'];
  readonly paymentMethod: OrderDoc['paymentMethod'];
  readonly paymentLabel: string;
  readonly productId: string;
  readonly productName: string;
  /** Free gift line (price 0, listed after its item): the gift's name, e.g. "Free shirt". */
  readonly giftName: string | null;
  /** Buy X Get Y discount on the line, e.g. "Free", "1 free" or "−50%"; null when none. */
  readonly dealLabel: string | null;
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
  /** Pending InstaPay: Confirmed asks staff to check the bank app first. */
  readonly confirmAction: 'confirm-order' | 'confirm-payment' | null;
  /** The status dropdown: only the moves allowed from the current status (empty = no dropdown). */
  readonly statusMoves: readonly OrderStatusMove[];
  /** Items are out of stock for this order right now (a cancel puts them back). */
  readonly stockTaken: boolean;
  /** Every status change, oldest first (staff-only). */
  readonly history: readonly OrderHistoryEntry[];
  /** Staff-only note saved when the order was cancelled. */
  readonly cancelReason: string | null;
  /**
   * Large Egypt order: `set` while the delivery fee is still to be agreed, `change` once saved
   * and the order is still open. Null for every other order.
   */
  readonly deliveryFeeAction: 'set' | 'change' | null;
  /** Delivery fee saved on the order in whole EGP (for the Change dialog). */
  readonly deliveryFeeEgp: number | null;
  /** Money staff should see arrive before confirming, e.g. `EGP 1,500`. Null when nothing is due. */
  readonly amountDueLabel: string | null;
}

/** One order on the Orders page: its first row carries the order actions, `lines` are the items. */
export interface OrderCard {
  readonly orderId: string;
  readonly first: OrderLineAdminRow;
  readonly lines: readonly OrderLineAdminRow[];
}
