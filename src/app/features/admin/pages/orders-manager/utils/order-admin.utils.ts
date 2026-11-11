import {
  isDeliveryFeeToBeAgreed,
  orderStage,
  paymentDue,
  shopperWhatsappNumber,
  staffWhatsappText,
} from '@core/config/order-messages';
import {
  allowedStatusMoves,
  orderStatusLabel,
  orderStockTaken,
  type StaffOrderStatus,
} from '@core/config/order-status';
import { whatsappChatUrl } from '@core/config/store-info';
import { dealTag, displayDecimals } from '@core/services/offers/engine';
import { orderMessageInput } from '@core/services/orders/order-message-input';
import { shortOrderRef } from '@core/services/orders/order-ref';
import type { OrderDoc, OrderStaffNotes } from '@core/services/orders/order.schema';
import { formatMoney } from '@shared/utils/money';
import { orderDate } from '@core/services/orders/shopper-orders.service';
import type {
  OrderHistoryEntry,
  OrderLineAdminRow,
  OrderStatusMove,
  OrderLineStockStatus,
  ProductStockLookup,
} from '../models/order-admin.model';

export function paymentLabel(order: OrderDoc): string {
  switch (order.paymentMethod) {
    case 'cash-on-delivery':
      return 'Cash on Delivery';
    case 'instapay':
      return 'InstaPay';
    case 'paymob':
      return 'Card (Paymob)';
    case 'international-bank-transfer':
      return 'Bank Transfer (legacy)';
  }
}

export function formatPlacedAt(order: OrderDoc): string {
  const raw = order.createdAt;
  const date =
    raw instanceof Date
      ? raw
      : typeof raw === 'object' && raw && 'toDate' in raw && typeof raw.toDate === 'function'
        ? raw.toDate()
        : null;
  return date ? date.toLocaleString() : '';
}

export function formatOrderTotal(order: OrderDoc): string {
  const total = formatMoney(
    order.pricing.totalDisplay,
    order.pricing.currency,
    displayDecimals(order.pricing.currency),
  );
  return isDeliveryFeeToBeAgreed(order.pricing.shipping) ? `${total} + shipping` : total;
}

/** Collect unique product ids from order pricing lines. */
export function productIdsFromOrders(orders: readonly OrderDoc[]): readonly string[] {
  const ids = new Set<string>();
  for (const order of orders) {
    for (const line of order.pricing.lines) {
      if (line.productId) ids.add(line.productId);
    }
  }
  return [...ids];
}

/**
 * Live units left for one order line from the current product doc.
 * Prefers `stockBySize[size]` when the line picked a size; otherwise total `stock`.
 */
export function currentStockForLine(
  product: ProductStockLookup | null | undefined,
  selection: Readonly<Record<string, string>>,
): { readonly count: number | null; readonly status: OrderLineStockStatus } {
  if (!product) return { count: null, status: 'missing' };

  const sizeId = selection['size'];
  if (sizeId && product.stockBySize) {
    const count = product.stockBySize[sizeId] ?? 0;
    return { count, status: count > 0 ? 'in' : 'out' };
  }

  if (typeof product.stock === 'number') {
    return { count: product.stock, status: product.stock > 0 ? 'in' : 'out' };
  }

  return { count: null, status: 'unset' };
}

export function selectionLabel(
  product: ProductStockLookup | null | undefined,
  selection: Readonly<Record<string, string>>,
): string {
  const entries = Object.entries(selection);
  if (entries.length === 0) return '—';

  return entries
    .map(([key, valueId]) => {
      const option = product?.options.find((item) => item.key === key);
      const valueLabel = option?.values.find((value) => value.id === valueId)?.label ?? valueId;
      const optionLabel = option?.label ?? key;
      return `${optionLabel}: ${valueLabel}`;
    })
    .join(' · ');
}

/**
 * Order-level actions, decided by the order's current stage. The WhatsApp text always matches
 * the status loaded now (the list reloads after every confirm or cancel).
 */
export function orderActions(
  order: OrderDoc,
  notes: OrderStaffNotes | null = null,
): Pick<
  OrderLineAdminRow,
  | 'stage'
  | 'whatsappUrl'
  | 'confirmAction'
  | 'statusMoves'
  | 'stockTaken'
  | 'history'
  | 'cancelReason'
  | 'amountDueLabel'
  | 'deliveryFeeAction'
  | 'deliveryFeeEgp'
> {
  const input = orderMessageInput(order);
  const stage = orderStage(input);
  const shopperNumber = shopperWhatsappNumber(order.shipping.phone, order.shipping.country);
  const text = staffWhatsappText(stage, input, order.shipping.fullName);
  const due = paymentDue(stage, input);
  const open = order.status === 'pending';
  const manual = order.paymentMethod === 'cash-on-delivery' || order.paymentMethod === 'instapay';
  const shipping = order.pricing.shipping;
  const agreedLine = manual && open && shipping?.kind === 'domestic-agreed';
  // Confirm waits until the delivery fee of a large order is saved.
  const canConfirm = open && stage !== 'fee-to-be-agreed';
  return {
    stage,
    whatsappUrl: shopperNumber && text ? whatsappChatUrl(shopperNumber, text) : null,
    confirmAction:
      canConfirm && order.paymentMethod === 'cash-on-delivery'
        ? 'confirm-order'
        : canConfirm && order.paymentMethod === 'instapay'
          ? 'confirm-payment'
          : null,
    statusMoves: statusMoves(order, stage === 'fee-to-be-agreed'),
    stockTaken: stockTaken(order),
    history: statusHistory(notes),
    cancelReason: notes?.cancelReason?.trim() || null,
    amountDueLabel: due?.amountEgp != null ? formatMoney(due.amountEgp, 'EGP', 0) : null,
    deliveryFeeAction: agreedLine ? (isDeliveryFeeToBeAgreed(shipping) ? 'set' : 'change') : null,
    deliveryFeeEgp: agreedLine && !isDeliveryFeeToBeAgreed(shipping) ? (shipping?.priceEgp ?? null) : null,
  };
}

/**
 * The status dropdown's choices: the shared move table (`@core/config/order-status`, the same
 * one `setOrderStatus` checks), minus Confirmed while a large order's delivery fee is still to be
 * agreed. A step back reads "Back to …".
 */
export function statusMoves(order: OrderDoc, feeToBeAgreed: boolean): OrderStatusMove[] {
  return allowedStatusMoves({ status: order.status, paymentMethod: order.paymentMethod })
    .filter((status) => !(status === 'confirmed' && order.status === 'pending' && feeToBeAgreed))
    .map((status) => ({
      status,
      label: isStepBack(order.status, status)
        ? `Back to ${orderStatusLabel(status)}`
        : orderStatusLabel(status),
    }));
}

const STEP_ORDER: readonly OrderDoc['status'][] = ['pending', 'confirmed', 'shipped', 'delivered'];

function isStepBack(from: OrderDoc['status'], to: StaffOrderStatus): boolean {
  const a = STEP_ORDER.indexOf(from);
  const b = STEP_ORDER.indexOf(to);
  return a >= 0 && b >= 0 && b < a;
}

function stockTaken(order: OrderDoc): boolean {
  const stamp = 'stockDecrementedAt' in order ? order.stockDecrementedAt : undefined;
  return orderStockTaken(
    stamp === undefined ? { status: order.status } : { status: order.status, stockDecrementedAt: stamp },
  );
}

const HISTORY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function statusHistory(notes: OrderStaffNotes | null): OrderHistoryEntry[] {
  if (!notes) return [];
  return notes.statusHistory.map((entry) => {
    const date = orderDate(entry.at);
    return {
      label: orderStatusLabel(entry.status),
      when: date ? HISTORY_FORMAT.format(date) : '',
      by: entry.byEmail || entry.by || '',
      reason: entry.reason?.trim() || null,
    };
  });
}

/** One table row per order line, with live stock from product docs. */
export function toOrderLineAdminRows(
  orders: readonly OrderDoc[],
  productsById: ReadonlyMap<string, ProductStockLookup>,
  notesById: ReadonlyMap<string, OrderStaffNotes> = new Map(),
): readonly OrderLineAdminRow[] {
  const rows: OrderLineAdminRow[] = [];

  for (const order of orders) {
    const placedAtLabel = formatPlacedAt(order);
    const payLabel = paymentLabel(order);
    const orderTotalLabel = formatOrderTotal(order);
    const actions = orderActions(order, notesById.get(order.id) ?? null);

    order.pricing.lines.forEach((line, index) => {
      const product = productsById.get(line.productId) ?? null;
      const selection = line.selection ?? {};
      const stock = currentStockForLine(product, selection);

      rows.push({
        id: `${order.id}:${index}:${line.productId}`,
        orderId: order.id,
        orderRef: shortOrderRef(order.id),
        placedAtLabel,
        customerName: order.shipping.fullName,
        country: order.shipping.country,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentLabel: payLabel,
        productId: line.productId,
        // Prefer what was saved on the order; older orders fall back to the live product.
        productName: line.name || product?.name || 'Product unavailable',
        giftName: line.gift ? line.gift.giftName || 'Free gift' : null,
        dealLabel: line.deals?.length ? dealTag(line.deals, line.quantity) || null : null,
        selectionLabel: line.optionLabels?.length
          ? line.optionLabels.map((opt) => `${opt.label}: ${opt.value}`).join(' · ')
          : selectionLabel(product, selection),
        quantity: line.quantity,
        currentStock: stock.count,
        stockStatus: stock.status,
        orderTotalLabel,
        phone: order.shipping.phone,
        isFirstLine: index === 0,
        ...actions,
      });
    });
  }

  return rows;
}
