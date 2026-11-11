import { orderStage, paymentDue, type OrderStage } from '@core/config/order-messages';
import { dealTag, displayDecimals } from '@core/services/offers/engine';
import { orderMessageInput } from '@core/services/orders/order-message-input';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { orderDate } from '@core/services/orders/shopper-orders.service';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import type {
  OrderDetailItem,
  OrderDetailRow,
  OrderDetails,
  ProductStockLookup,
} from '../models/order-admin.model';
import { currentStockForLine, paymentLabel, selectionLabel } from './order-admin.utils';

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "11 Nov, 2:14 pm", or empty when the saved date is unreadable. */
export function shortOrderDate(raw: unknown): string {
  const date = orderDate(raw);
  return date ? SHORT_DATE.format(date) : '';
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Box 2", "Box 1 (abroad)", "Delivery fee to be agreed". */
function shippingLabel(order: OrderDoc): string | null {
  const line = order.pricing.shipping;
  if (!line) return null;
  if (line.kind === 'domestic-agreed') {
    return line.feeAgreed ? 'Large order · fee agreed' : 'Large order · fee to be agreed';
  }
  const box = line.boxId ? `Box ${line.boxId.replace(/\D/g, '') || line.boxId}` : null;
  if (line.kind === 'international-box') return box ? `${box} (abroad)` : 'Abroad';
  return box;
}

/** What staff should do next, from the order's stage. Null when nothing is waiting on them. */
function nextStep(stage: OrderStage, order: OrderDoc, money: (egp: number) => string): string | null {
  const due = paymentDue(stage, orderMessageInput(order));
  const amount = due?.amountEgp != null ? money(due.amountEgp) : 'the amount';
  switch (stage) {
    case 'fee-to-be-agreed':
      return 'Agree the delivery fee with the customer on WhatsApp, then use Set Delivery Fee.';
    case 'instapay-total-due':
      return `Check that ${amount} arrived in your bank app, then change the status to Confirmed.`;
    case 'instapay-fee-due':
      return `Check that the delivery fee of ${amount} arrived by InstaPay, then change the status to Confirmed.`;
    case 'bank-transfer-due': {
      const payIn = due?.payIn;
      const sent = payIn
        ? formatMoney(payIn.amount, payIn.currency, displayDecimals(payIn.currency))
        : 'the transfer';
      return `Check that ${sent} arrived in your bank account, then change the status to Confirmed.`;
    }
    case 'cod-free-pending':
      return 'Confirm the order with the customer on WhatsApp, then change the status to Confirmed.';
    case 'paid-needs-review':
      return 'Paid while an item had sold out. Check the stock and message the customer before you ship.';
    case 'paid':
    case 'cod-confirmed':
      return 'Pack the order and send it, then change the status to Shipped.';
    case 'shipped':
      return 'Change the status to Delivered once the customer has the order.';
    default:
      return null;
  }
}

/** Every saved line as staff see it: photo, options, offer, prices and live stock. */
function detailItems(
  order: OrderDoc,
  productsById: ReadonlyMap<string, ProductStockLookup>,
  money: (amount: number) => string,
): OrderDetailItem[] {
  const pricing = order.pricing;
  return pricing.lines.map((line, index) => {
    const product = productsById.get(line.productId) ?? null;
    const selection = line.selection ?? {};
    const stock = currentStockForLine(product, selection);
    const imagePath = line.imagePath?.trim() || null;
    const options = line.optionLabels?.length
      ? line.optionLabels.map((opt) => `${opt.label}: ${opt.value}`).join(' · ')
      : Object.keys(selection).length
        ? selectionLabel(product, selection)
        : '';
    const gift = line.gift ? line.gift.giftName || 'Free gift' : null;
    const discounted = (line.discountEgp ?? 0) > 0;
    return {
      key: `${index}:${line.productId}`,
      productId: line.productId,
      productExists: product !== null,
      name: line.name || product?.name || 'Product unavailable',
      options,
      imagePath,
      imageSrc: imagePath ? normalizeImageKitPath(imagePath) : '',
      quantity: line.quantity,
      gift,
      deal: line.deals?.length ? dealTag(line.deals, line.quantity) || null : null,
      unit: gift ? null : `${money(line.unitDisplay)} × ${line.quantity}`,
      price: gift || line.lineDisplay === 0 ? 'Free' : money(line.lineDisplay),
      was: discounted && !gift ? money(line.fullEgp ?? line.unitDisplay * line.quantity) : null,
      stock:
        stock.status === 'missing'
          ? 'Product removed'
          : stock.count === null
            ? 'Stock not set'
            : `${stock.count} left${stock.count > 0 && stock.count <= 2 ? ' · Low' : ''}`,
      stockStatus: stock.status,
    };
  });
}

/** Payment rows: what to receive, what came in, and the Card / Bank Transfer details. */
function paymentRows(order: OrderDoc, stage: OrderStage, egp: (amount: number) => string): OrderDetailRow[] {
  const rows: OrderDetailRow[] = [];
  const pricing = order.pricing;
  const due = paymentDue(stage, orderMessageInput(order));
  if (due) {
    if (due.reason === 'bank-transfer' && due.payIn) {
      rows.push({
        label: 'To receive by bank transfer',
        value: formatMoney(due.payIn.amount, due.payIn.currency, displayDecimals(due.payIn.currency)),
        strong: true,
      });
    } else if (due.amountEgp != null) {
      rows.push({
        label: due.reason === 'shipping-fee' ? 'Delivery fee by InstaPay' : 'To receive by InstaPay',
        value: egp(due.amountEgp),
        strong: true,
      });
    }
    rows.push({ label: 'Received', value: 'Not yet' });
  } else if (pricing.payIn && order.paymentMethod === 'bank-transfer') {
    rows.push({
      label: 'Customer sent',
      value: formatMoney(
        pricing.payIn.amount,
        pricing.payIn.currency,
        displayDecimals(pricing.payIn.currency),
      ),
    });
  }

  if (
    order.paymentMethod === 'cash-on-delivery' &&
    order.status !== 'cancelled' &&
    order.status !== 'failed' &&
    pricing.shipping &&
    typeof pricing.totalEgp === 'number'
  ) {
    const cash = pricing.totalEgp - pricing.shipping.priceEgp;
    if (cash > 0) rows.push({ label: 'Cash at the door', value: egp(cash) });
  }

  if ('paymob' in order && order.paymob) {
    const paid = shortOrderDate(order.paymob.paidAt);
    rows.push({ label: 'Card payment', value: paid ? `Paid ${paid}` : 'Not paid yet' });
    if (order.paymob.transactionId != null) {
      rows.push({ label: 'Card transaction number', value: String(order.paymob.transactionId) });
    }
  }

  if (pricing.currency !== 'EGP') {
    rows.push({ label: 'Customer saw prices in', value: pricing.currency });
  }
  return rows;
}

/** Everything staff need about one order, built from the saved order (and live stock). */
export function orderDetails(
  order: OrderDoc,
  productsById: ReadonlyMap<string, ProductStockLookup>,
): OrderDetails {
  const pricing = order.pricing;
  const decimals = displayDecimals(pricing.currency);
  const money = (amount: number) => formatMoney(amount, pricing.currency, decimals);
  const egp = (amount: number) => formatMoney(amount, 'EGP', 0);
  const stage = orderStage(orderMessageInput(order));
  const shipping = order.shipping;
  const feeToBeAgreed = pricing.shipping?.kind === 'domestic-agreed' && pricing.shipping.feeAgreed !== true;

  const cityLine = [shipping.city, shipping.region].filter(Boolean).join(', ');
  const addressLines = [
    shipping.line1,
    shipping.line2,
    [cityLine, shipping.postalCode].filter(Boolean).join(' '),
    countryName(shipping.country),
  ].filter((part): part is string => !!part && part.trim() !== '');

  const items = detailItems(order, productsById, money);
  const pieces = pricing.lines.filter((line) => !line.gift).reduce((sum, line) => sum + line.quantity, 0);

  const totals: OrderDetailRow[] = [
    { label: 'Subtotal', value: money(pricing.subtotalDisplay) },
    {
      label: shippingLabel(order) ? `Shipping · ${shippingLabel(order)}` : 'Shipping',
      value: !pricing.shipping
        ? '—'
        : feeToBeAgreed
          ? 'To be agreed'
          : pricing.shipping.priceDisplay === 0
            ? 'Free'
            : money(pricing.shipping.priceDisplay),
    },
  ];
  const total = feeToBeAgreed ? `${money(pricing.totalDisplay)} + shipping` : money(pricing.totalDisplay);
  const totalEgp =
    pricing.currency !== 'EGP' && typeof pricing.totalEgp === 'number' ? egp(pricing.totalEgp) : null;

  return {
    stage,
    nextStep: nextStep(stage, order, egp),
    customer: {
      name: shipping.fullName,
      email: order.customerEmail?.trim() || null,
      phone: shipping.phone,
      account: order.customerId ? 'Has an account' : 'Guest',
    },
    city: shipping.country === 'EG' ? shipping.city : `${shipping.city}, ${countryName(shipping.country)}`,
    address: {
      lines: addressLines,
      copyText: [shipping.fullName, ...addressLines, shipping.phone].join('\n'),
    },
    shippingBox: shippingLabel(order),
    payment: {
      method: paymentLabel(order),
      rows: paymentRows(order, stage, egp),
    },
    items,
    thumbs: items.filter((item) => item.imagePath).slice(0, 3),
    pieces: `${pieces} ${pieces === 1 ? 'item' : 'items'}`,
    totals,
    total,
    totalEgp,
    needsReview: 'needsReview' in order && order.needsReview === true,
    placedShort: shortOrderDate(order.createdAt),
  };
}
