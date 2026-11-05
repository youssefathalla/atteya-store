import { displayDecimals } from '@core/services/offers/engine';
import { shortOrderRef } from '@core/services/orders/order-ref';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { formatMoney } from '@shared/utils/money';
import type {
  OrderLineAdminRow,
  OrderLineStockStatus,
  ProductStockLookup,
} from '../models/order-admin.model';

export function paymentLabel(order: OrderDoc): string {
  if (order.paymentMethod === 'cash-on-delivery') return 'Cash on delivery';
  if (order.paymentMethod === 'international-bank-transfer') return 'Bank transfer (legacy)';
  return 'Paymob';
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
  return formatMoney(
    order.pricing.totalDisplay,
    order.pricing.currency,
    displayDecimals(order.pricing.currency),
  );
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

/** One table row per order line, with live stock from product docs. */
export function toOrderLineAdminRows(
  orders: readonly OrderDoc[],
  productsById: ReadonlyMap<string, ProductStockLookup>,
): readonly OrderLineAdminRow[] {
  const rows: OrderLineAdminRow[] = [];

  for (const order of orders) {
    const placedAtLabel = formatPlacedAt(order);
    const payLabel = paymentLabel(order);
    const orderTotalLabel = formatOrderTotal(order);

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
        selectionLabel: line.optionLabels?.length
          ? line.optionLabels.map((opt) => `${opt.label}: ${opt.value}`).join(' · ')
          : selectionLabel(product, selection),
        quantity: line.quantity,
        currentStock: stock.count,
        stockStatus: stock.status,
        orderTotalLabel,
      });
    });
  }

  return rows;
}
