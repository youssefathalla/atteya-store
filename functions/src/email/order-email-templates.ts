import {
  hasInstapayDetails,
  orderStage,
  paymentDue,
  shopperWhatsappText,
  type InstapayInfo,
  type OrderMessageInput,
} from '../store/order-messages.js';
import { whatsappChatUrl } from '../store/store-info.js';
import type { OrderEmailKind } from './order-email-events.js';
import { orderConfirmationUrl, type OrderEmailLine, type OrderEmailOrder } from './order-email-model.js';

/**
 * Order email copy. Agreed wording lives on the "Order emails with Resend" Linear issue (ATS-10);
 * keep both in step. Amounts are whole Egyptian pounds from the saved order.
 *
 * Cash on delivery (Egypt only): the shopper pays the shipping fee first by InstaPay, then the
 * rest (total − shipping) in cash on delivery. Free shipping means no deposit.
 * InstaPay (Egypt only): the shopper transfers the full total. Card or wallet (Paymob) is paid
 * in full online. InstaPay details and "send the screenshot" come only from `paymentDue()`
 * (functions/src/store/order-messages.ts), so a paid order never asks for money.
 */

export interface OrderEmailContext {
  /** Storefront origin without a trailing slash, or '' to leave links out. */
  readonly storefrontUrl: string;
  /** ImageKit origin for this project (no trailing slash), or '' to leave photos out. */
  readonly imageBaseUrl: string;
  /** True when replies reach a real inbox (RESEND_REPLY_TO is set). */
  readonly canReply: boolean;
  /** Brand name for the email header (`STORE_INFO.name`). */
  readonly storeName: string;
  /** Business WhatsApp as people read it (`STORE_INFO.contact.whatsapp`), or '' for none. */
  readonly whatsappNumber: string;
  /** Where shoppers send InstaPay transfers (`STORE_INFO.payments.instapay`); empty = not set. */
  readonly instapay: InstapayInfo;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const EGP = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

/** Same whole-pound format as the storefront `formatMoney(…, 'EGP', 0)`. */
export function formatEgp(amount: number): string {
  return EGP.format(amount);
}

/** Amount paid in cash at the door for a cash-on-delivery order. */
export function cashOnDeliveryEgp(order: OrderEmailOrder): number {
  return Math.max(0, order.totalEgp - order.shippingEgp);
}

export function renderOrderEmail(
  kind: OrderEmailKind,
  order: OrderEmailOrder,
  ctx: OrderEmailContext,
): RenderedEmail {
  switch (kind) {
    case 'cod-placed':
      return codPlaced(order, ctx);
    case 'cod-confirmed':
      return codConfirmed(order, ctx);
    case 'instapay-placed':
      return instapayPlaced(order, ctx);
    case 'instapay-confirmed':
      return instapayConfirmed(order, ctx);
    case 'delivery-fee-set':
      return deliveryFeeSet(order, ctx, false);
    case 'delivery-fee-changed':
      return deliveryFeeSet(order, ctx, true);
    case 'paid-confirmed':
      return paidConfirmed(order, ctx);
    case 'payment-failed':
      return paymentFailed(order, ctx);
    case 'order-shipped':
      return orderShipped(order, ctx);
    case 'order-delivered':
      return orderDelivered(order, ctx);
    case 'store-new-order':
      return storeNewOrder(order, ctx);
  }
}

// ── Shopper emails ───────────────────────────────────────────────────────────

/** Said on every email of a large order whose delivery fee isn't set yet. */
const FEE_TO_AGREE =
  "It's a large order, so we'll message you on WhatsApp to agree the delivery fee before we send it.";

function codPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  if (order.feeToBeAgreed) {
    return shopperEmail(order, ctx, {
      subject: `We got your order ${order.ref}`,
      heading: `Thanks for your order, ${firstName(order)}`,
      intro: [`We've received your order ${order.ref}. ${FEE_TO_AGREE}`],
      highlight: `Once we agree it, pay the delivery fee by InstaPay. You'll pay ${formatEgp(order.subtotalEgp)} for your items in cash when they arrive.`,
      showTotals: true,
      showAddress: true,
      button: orderButton(order, ctx),
    });
  }
  const cash = formatEgp(cashOnDeliveryEgp(order));
  const feeFirst = order.shippingEgp > 0;
  const payNow = feeFirst
    ? `We'll send your order once we receive the shipping fee. You'll pay the rest, ${cash}, in cash when it arrives.`
    : `Shipping is free on this order, so there's nothing to pay now. You'll pay ${cash} in cash when it arrives.`;
  return shopperEmail(order, ctx, {
    subject: `We got your order ${order.ref}`,
    heading: `Thanks for your order, ${firstName(order)}`,
    intro: [
      feeFirst
        ? `We've received your order ${order.ref}.`
        : `We've received your order ${order.ref}. We'll contact you to confirm it.`,
    ],
    highlight: payNow,
    payment: payBox(order, ctx),
    showTotals: true,
    showAddress: true,
    button: orderButton(order, ctx),
  });
}

function codConfirmed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const intro =
    order.shippingEgp > 0
      ? `Thanks, we've received your shipping fee and your order ${order.ref} is confirmed. We're getting it ready.`
      : `Good news: your order ${order.ref} is confirmed and we're getting it ready.`;
  return shopperEmail(order, ctx, {
    subject: `Your order ${order.ref} is confirmed`,
    heading: 'Your order is confirmed',
    intro: [intro],
    highlight: `Please have ${formatEgp(cashOnDeliveryEgp(order))} in cash ready when it arrives.`,
    showTotals: true,
    showAddress: true,
    button: orderButton(order, ctx),
  });
}

function instapayPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  if (order.feeToBeAgreed) {
    return shopperEmail(order, ctx, {
      subject: `We got your order ${order.ref}`,
      heading: `Thanks for your order, ${firstName(order)}`,
      intro: [`We've received your order ${order.ref}. ${FEE_TO_AGREE}`],
      highlight: "Once we agree it, transfer the total by InstaPay and we'll confirm your order.",
      showTotals: true,
      showAddress: true,
      button: orderButton(order, ctx),
    });
  }
  return shopperEmail(order, ctx, {
    subject: `We got your order ${order.ref}`,
    heading: `Thanks for your order, ${firstName(order)}`,
    intro: [`We've received your order ${order.ref}. We'll confirm it as soon as we receive your payment.`],
    highlight: null,
    payment: payBox(order, ctx),
    showTotals: true,
    showAddress: true,
    button: orderButton(order, ctx),
  });
}

function instapayConfirmed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  return shopperEmail(order, ctx, {
    subject: `Payment received – order ${order.ref} is confirmed`,
    heading: 'Payment received',
    intro: [
      `Thanks, ${firstName(order)}. We've received your InstaPay payment of ${formatEgp(order.totalEgp)} and your order ${order.ref} is confirmed. We're getting it ready.`,
    ],
    highlight: null,
    showTotals: true,
    totalLabel: 'Total paid',
    showAddress: true,
    button: orderButton(order, ctx),
  });
}

/**
 * Staff saved the delivery fee they agreed with the shopper on a large order (`changed` = a
 * later correction of that fee; the amounts to pay are the new ones).
 */
function deliveryFeeSet(order: OrderEmailOrder, ctx: OrderEmailContext, changed: boolean): RenderedEmail {
  const fee = order.shippingEgp > 0 ? formatEgp(order.shippingEgp) : null;
  const intro = [
    fee
      ? `The delivery fee for your order ${order.ref} is ${changed ? 'now ' : ''}${fee}.`
      : `Good news: delivery is ${changed ? 'now ' : ''}free on your order ${order.ref}.`,
  ];
  if (changed) {
    intro.push("If you've already sent a different amount, message us on WhatsApp and we'll sort it out.");
  }
  let highlight: string | null;
  if (order.paymentMethod === 'cash-on-delivery') {
    const cash = formatEgp(cashOnDeliveryEgp(order));
    highlight = fee
      ? `We'll send your order once we receive the delivery fee. You'll pay the rest, ${cash}, in cash when it arrives.`
      : `There's nothing to pay now. You'll pay ${cash} in cash when it arrives.`;
  } else {
    highlight = "We'll confirm your order as soon as we receive your payment.";
  }
  return shopperEmail(order, ctx, {
    subject: changed
      ? `Updated delivery fee for your order ${order.ref}`
      : `Delivery fee for your order ${order.ref}`,
    heading: changed ? 'Your delivery fee has changed' : 'Your delivery fee is ready',
    intro,
    highlight,
    payment: payBox(order, ctx),
    showTotals: true,
    showAddress: false,
    button: orderButton(order, ctx),
  });
}

function paidConfirmed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const intro = [
    `Thanks, ${firstName(order)}. We've received your payment of ${formatEgp(order.totalEgp)} and your order ${order.ref} is confirmed. We're getting it ready.`,
  ];
  if (order.isInternational) {
    intro.push(
      'You were charged in Egyptian pounds (EGP). Your bank converts it to your currency, so the amount on your statement may differ slightly.',
    );
  }
  return shopperEmail(order, ctx, {
    subject: `Payment received – order ${order.ref} is confirmed`,
    heading: 'Payment received',
    intro,
    highlight: null,
    showTotals: true,
    totalLabel: 'Total paid',
    showAddress: true,
    button: orderButton(order, ctx),
  });
}

function orderShipped(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const cod = order.paymentMethod === 'cash-on-delivery';
  return shopperEmail(order, ctx, {
    subject: `Your order ${order.ref} is on its way`,
    heading: 'Your order is on its way',
    intro: [`Good news, ${firstName(order)}: we've sent your order ${order.ref}.`],
    highlight: cod
      ? `Please have ${formatEgp(cashOnDeliveryEgp(order))} in cash ready when it arrives.`
      : null,
    showTotals: false,
    showAddress: true,
    button: orderButton(order, ctx),
  });
}

function orderDelivered(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  return shopperEmail(order, ctx, {
    subject: `Your order ${order.ref} was delivered`,
    heading: 'Your order was delivered',
    intro: [
      `Hi ${firstName(order)}, your order ${order.ref} was delivered. Thanks for shopping with us. We hope you enjoy it.`,
    ],
    highlight: null,
    showTotals: false,
    showAddress: false,
    button: orderButton(order, ctx),
  });
}

function paymentFailed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  return shopperEmail(order, ctx, {
    subject: `Your payment for order ${order.ref} didn't go through`,
    heading: "Your payment didn't go through",
    intro: [
      `Hi ${firstName(order)}, your payment for order ${order.ref} didn't go through, and you haven't been charged.`,
      "If you'd still like these items, please place the order again.",
    ],
    highlight: null,
    showTotals: false,
    showAddress: false,
    button: ctx.storefrontUrl ? { label: 'Shop Again', url: `${ctx.storefrontUrl}/shop` } : null,
  });
}

interface ShopperEmailParts {
  readonly subject: string;
  readonly heading: string;
  readonly intro: readonly string[];
  readonly highlight: string | null;
  /** InstaPay instructions while money is owed (`payBox()`); omit everywhere else. */
  readonly payment?: PayBox | null;
  readonly showTotals: boolean;
  readonly totalLabel?: string;
  readonly showAddress: boolean;
  readonly button: EmailButton | null;
}

function shopperEmail(
  order: OrderEmailOrder,
  ctx: OrderEmailContext,
  parts: ShopperEmailParts,
): RenderedEmail {
  const waNumber = ctx.whatsappNumber.trim();
  const waLink = whatsappChatUrl(waNumber);
  // WhatsApp is the client's main channel, so it wins over "reply to this email".
  const help = waLink
    ? `Questions? Message us on WhatsApp: ${waNumber}`
    : ctx.canReply
      ? 'Questions? Just reply to this email.'
      : null;
  const helpHtml = waLink
    ? `<p style="margin:16px 0 0;font-size:13px;color:${MUTED};">Questions? Message us on WhatsApp: <a href="${escapeHtml(waLink)}" style="color:${INK};font-weight:600;">${escapeHtml(waNumber)}</a></p>`
    : help
      ? smallText(help)
      : '';
  const html = layout(ctx.storeName, parts.subject, [
    h1(parts.heading),
    ...parts.intro.map((line) => paragraph(line)),
    parts.highlight ? highlightBox(parts.highlight) : '',
    parts.payment ? payBoxHtml(parts.payment) : '',
    itemsTable(order.lines, ctx),
    parts.showTotals ? totalsTable(order, parts.totalLabel ?? 'Total') : '',
    parts.showAddress ? addressBlock(order) : '',
    parts.button ? buttonHtml(parts.button) : '',
    helpHtml,
  ]);
  const text = joinText([
    parts.heading,
    ...parts.intro,
    parts.highlight,
    parts.payment ? payBoxText(parts.payment) : null,
    itemsText(order.lines),
    parts.showTotals ? totalsText(order, parts.totalLabel ?? 'Total') : null,
    parts.showAddress ? `Delivery Address:\n${addressLines(order).join('\n')}` : null,
    parts.button ? `${parts.button.label}: ${parts.button.url}` : null,
    help,
  ]);
  return { subject: parts.subject, html, text };
}

// ── Store-owner alert ────────────────────────────────────────────────────────

function storeNewOrder(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const method = order.paymentMethod;
  const label =
    method === 'cash-on-delivery'
      ? 'Cash on Delivery'
      : method === 'instapay'
        ? 'InstaPay – Waiting for Transfer'
        : 'Paid Online';
  const amount = order.feeToBeAgreed
    ? `${formatEgp(order.subtotalEgp)} + Delivery`
    : formatEgp(order.totalEgp);
  const subject = order.feeToBeAgreed
    ? `New Order ${order.ref} – ${amount} – Agree Delivery Fee`
    : `New Order ${order.ref} – ${amount} – ${label}`;
  const payment = storePayment(order);
  const warning = order.needsReview
    ? 'One item sold out before this payment came in. Please check this order.'
    : null;
  const customer = [order.address.fullName, order.address.phone, order.customerEmail].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  const button = ctx.storefrontUrl
    ? { label: 'Open Orders in the Dashboard', url: `${ctx.storefrontUrl}/admin/orders` }
    : null;

  const html = layout(ctx.storeName, subject, [
    h1(`New Order ${order.ref}`),
    warning ? highlightBox(`⚠ ${warning}`) : '',
    storePaymentHtml(payment),
    labelledLines('Customer', customer),
    itemsTable(order.lines, ctx),
    totalsTable(order, 'Total'),
    addressBlock(order),
    button ? buttonHtml(button, 'tonal') : '',
  ]);
  const text = joinText([
    `New Order ${order.ref}`,
    warning,
    storePaymentText(payment),
    `Customer:\n${customer.join('\n')}`,
    itemsText(order.lines),
    totalsText(order, 'Total'),
    `Delivery Address:\n${addressLines(order).join('\n')}`,
    button ? `${button.label}: ${button.url}` : null,
  ]);
  return { subject, html, text };
}

/** What staff collect for a new order: the method on its own, then the amounts. */
interface StorePayment {
  readonly method: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly note: string | null;
}

function storePayment(order: OrderEmailOrder): StorePayment {
  const total = formatEgp(order.totalEgp);
  if (order.feeToBeAgreed) {
    return {
      method: order.paymentMethod === 'instapay' ? 'InstaPay' : 'Cash on Delivery',
      rows: [
        ['Items', formatEgp(order.subtotalEgp)],
        ['Delivery Fee', 'To Be Agreed'],
      ],
      note: 'This order is heavier than the biggest box. Agree the delivery fee with the customer on WhatsApp, then set it in the dashboard.',
    };
  }
  switch (order.paymentMethod) {
    case 'cash-on-delivery':
      return order.shippingEgp > 0
        ? {
            method: 'Cash on Delivery',
            rows: [
              ['Shipping Fee', formatEgp(order.shippingEgp)],
              ['Cash at the Door', formatEgp(cashOnDeliveryEgp(order))],
            ],
            note: 'Send the order once the shipping fee arrives on InstaPay.',
          }
        : {
            method: 'Cash on Delivery',
            rows: [
              ['Shipping Fee', 'Free'],
              ['Cash at the Door', formatEgp(cashOnDeliveryEgp(order))],
            ],
            note: null,
          };
    case 'instapay':
      return {
        method: 'InstaPay',
        rows: [['Waiting for Transfer', total]],
        note: 'Confirm the payment in the dashboard once you see it in your bank app.',
      };
    default:
      return { method: 'Card', rows: [['Paid', total]], note: null };
  }
}

function storePaymentText(payment: StorePayment): string {
  return [payment.method, ...payment.rows.map(([label, value]) => `${label}: ${value}`), payment.note]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function storePaymentHtml(payment: StorePayment): string {
  const rows = payment.rows
    .map(
      ([label, value]) => `<tr>
<td style="padding:4px 0;">${escapeHtml(label)}</td>
<td align="right" style="padding:4px 0;font-weight:700;white-space:nowrap;">${escapeHtml(value)}</td>
</tr>`,
    )
    .join('\n');
  const note = payment.note
    ? `<p style="margin:8px 0 0;font-size:13px;color:${MUTED};">${escapeHtml(payment.note)}</p>`
    : '';
  return `<div style="margin:16px 0;padding:12px 14px;border:1px solid ${INK};">
<p style="margin:0 0 6px;font-size:17px;font-weight:700;">${escapeHtml(payment.method)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${FONT}font-size:14px;color:${INK};">
${rows}
</table>${note}</div>`;
}

// ── Building blocks ──────────────────────────────────────────────────────────

/** InstaPay instructions for an order that still owes money. */
interface PayBox {
  readonly lines: readonly string[];
  readonly whatsapp: EmailButton | null;
}

function messageInput(order: OrderEmailOrder): OrderMessageInput {
  return {
    ref: order.ref,
    paymentMethod: order.paymentMethod,
    status: order.status,
    country: order.address.country,
    // Not known until staff set the delivery fee.
    shippingEgp: order.feeToBeAgreed ? null : order.shippingEgp,
    totalEgp: order.feeToBeAgreed ? null : order.totalEgp,
    needsReview: order.needsReview,
    feeToBeAgreed: order.feeToBeAgreed,
  };
}

/**
 * Null unless `paymentDue()` says money is owed (open InstaPay order, or open cash on delivery
 * with a shipping fee). The WhatsApp button opens a chat with the shopper's message already
 * written in Arabic.
 */
function payBox(order: OrderEmailOrder, ctx: OrderEmailContext): PayBox | null {
  const input = messageInput(order);
  const stage = orderStage(input);
  const due = paymentDue(stage, input);
  if (!due) return null;

  const amount = due.amountEgp !== null ? ` ${formatEgp(due.amountEgp)}` : '';
  const what = due.reason === 'shipping-fee' ? `the${amount} shipping fee` : amount.trim() || 'the total';
  const waUrl = whatsappChatUrl(ctx.whatsappNumber, shopperWhatsappText(stage, input, ctx.instapay));
  const details = hasInstapayDetails(ctx.instapay);
  const lines: string[] = [];

  if (details) {
    lines.push(`Pay ${what} by InstaPay to:`);
    const address = ctx.instapay.address.trim();
    const number = ctx.instapay.number.trim();
    if (address) lines.push(`InstaPay address: ${address}`);
    if (number) lines.push(`InstaPay number: ${number}`);
    lines.push(
      waUrl
        ? 'Then send us a screenshot of the transfer.'
        : ctx.canReply
          ? 'Then reply to this email with a screenshot of the transfer.'
          : 'Then send us a screenshot of the transfer.',
    );
  } else {
    lines.push(`Pay ${what} by InstaPay.`);
    lines.push(
      waUrl ? "We'll send you the InstaPay details on WhatsApp." : "We'll send you the InstaPay details.",
    );
  }

  return {
    lines,
    whatsapp: waUrl ? { label: details ? 'Send on WhatsApp' : 'Message Us on WhatsApp', url: waUrl } : null,
  };
}

function payBoxText(box: PayBox): string {
  const button = box.whatsapp ? `\n${box.whatsapp.label}: ${box.whatsapp.url}` : '';
  return `${box.lines.join('\n')}${button}`;
}

export interface EmailButton {
  readonly label: string;
  readonly url: string;
}

function orderButton(order: OrderEmailOrder, ctx: OrderEmailContext): EmailButton | null {
  if (!ctx.storefrontUrl) return null;
  return {
    label: 'View Your Order',
    url: orderConfirmationUrl(ctx.storefrontUrl, order.id, order.viewKey),
  };
}

function firstName(order: OrderEmailOrder): string {
  const first = order.address.fullName.split(/\s+/)[0] ?? '';
  return first || 'there';
}

function lineTitle(line: OrderEmailLine): string {
  return line.name || 'Item';
}

function lineDetails(line: OrderEmailLine): string {
  return [...lineTags(line), `Qty ${line.quantity}`].join(' · ');
}

export function imageUrl(path: string | null, ctx: OrderEmailContext): string | null {
  if (!path) return null;
  if (path.startsWith('https://')) return path;
  if (!ctx.imageBaseUrl) return null;
  const clean = path
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${ctx.imageBaseUrl}/${clean}?tr=w-192,h-240,c-at_max`;
}

function addressLines(order: OrderEmailOrder): string[] {
  const a = order.address;
  const lines = [a.fullName, a.line1];
  if (a.line2) lines.push(a.line2);
  if (order.isInternational) {
    lines.push([a.city, a.region, a.postalCode].filter(Boolean).join(', '));
    lines.push(countryName(a.country));
  } else {
    lines.push(a.city);
  }
  return lines.filter((line) => line.trim().length > 0);
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function totalsRows(order: OrderEmailOrder, totalLabel: string): [string, string][] {
  if (order.feeToBeAgreed) {
    return [
      ['Subtotal', formatEgp(order.subtotalEgp)],
      ['Shipping', "We'll contact you"],
      [totalLabel, `${formatEgp(order.subtotalEgp)} + shipping`],
    ];
  }
  return [
    ['Subtotal', formatEgp(order.subtotalEgp)],
    ['Shipping', order.shippingEgp > 0 ? formatEgp(order.shippingEgp) : 'Free'],
    [totalLabel, formatEgp(order.totalEgp)],
  ];
}

function itemsText(lines: readonly OrderEmailLine[]): string {
  return lines
    .map((line) =>
      line.giftName !== null
        ? `  + ${line.giftName}: ${lineTitle(line)} (${lineDetails(line)}): Free`
        : `- ${lineTitle(line)} (${lineDetails(line)}): ${formatEgp(line.lineEgp)}${line.dealTag ? ` (${line.dealTag})` : ''}`,
    )
    .join('\n');
}

function totalsText(order: OrderEmailOrder, totalLabel: string): string {
  return totalsRows(order, totalLabel)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

function joinText(parts: readonly (string | null | undefined)[]): string {
  return `${parts.filter((part): part is string => Boolean(part)).join('\n\n')}\n`;
}

// ── HTML (inline styles; email clients ignore stylesheets) ──────────────────

const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const INK = '#111111';
const MUTED = '#555555';
const LINE = '#e5e5e5';
const TONAL = '#e8e8e8';

export function layout(storeName: string, title: string, blocks: readonly string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:12px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};">
<tr><td style="padding:14px 12px;border-bottom:1px solid ${LINE};${FONT}font-size:18px;font-weight:700;letter-spacing:2px;color:${INK};">${escapeHtml(storeName.toUpperCase())}</td></tr>
<tr><td style="padding:12px;${FONT}color:${INK};font-size:15px;line-height:1.5;">
${blocks.filter(Boolean).join('\n')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function h1(textValue: string): string {
  return `<h1 style="margin:0 0 16px;${FONT}font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(textValue)}</h1>`;
}

export function paragraph(textValue: string, alreadyEscaped = false): string {
  const body = alreadyEscaped ? textValue : escapeHtml(textValue);
  return `<p style="margin:0 0 12px;">${body}</p>`;
}

export function smallText(textValue: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;color:${MUTED};">${escapeHtml(textValue)}</p>`;
}

function payBoxHtml(box: PayBox): string {
  const lines = box.lines.map(escapeHtml).join('<br>');
  const button = box.whatsapp ? buttonHtml(box.whatsapp) : '';
  return `<div style="margin:16px 0;padding:12px 14px;border:1px solid ${INK};"><p style="margin:0;">${lines}</p>${button}</div>`;
}

function highlightBox(textValue: string): string {
  return `<p style="margin:16px 0;padding:12px 14px;border:1px solid ${INK};font-weight:600;">${escapeHtml(textValue)}</p>`;
}

/** Short tags for a line's options: "Size M" for the size, the plain value for the rest. */
function lineTags(line: OrderEmailLine): string[] {
  return line.optionLabels
    .map((opt) => (opt.label.trim().toLowerCase() === 'size' ? `Size ${opt.value}` : opt.value))
    .filter((tag) => tag.trim().length > 0);
}

/**
 * One bordered card per item: photo and name with option tags on top, then a grey strip with
 * the quantity and the line price. Long names wrap inside the card and never squeeze the price.
 */
function itemsTable(lines: readonly OrderEmailLine[], ctx: OrderEmailContext): string {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const cards = lines
    .map((line) => {
      const src = imageUrl(line.imagePath, ctx);
      const photoCell = src
        ? `<td width="84" valign="top" style="padding:12px 0 12px 12px;"><img src="${escapeHtml(src)}" width="72" alt="" style="display:block;width:72px;height:auto;border:0;border-radius:2px;"></td>\n`
        : '';
      const gift = line.giftName !== null;
      const tags = [
        ...(gift ? [line.giftName!] : []),
        ...(line.dealTag ? [line.dealTag] : []),
        ...lineTags(line),
      ]
        .map(
          (tag) =>
            `<span style="display:inline-block;margin:6px 6px 0 0;padding:1px 8px;border:1px solid #d4d4d4;font-size:12px;color:#444444;">${escapeHtml(tag)}</span>`,
        )
        .join('');
      // A gift sits indented under the item it came with, priced "Free".
      const indent = gift ? 'margin-left:24px;width:auto;' : '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;${indent}border:1px solid ${LINE};border-radius:2px;${FONT}font-size:14px;color:${INK};">
<tr>
${photoCell}<td valign="top" style="padding:12px;">
<div style="font-weight:600;">${escapeHtml(lineTitle(line))}</div>${tags ? `\n<div>${tags}</div>` : ''}
</td>
</tr>
<tr><td${src ? ' colspan="2"' : ''} style="padding:8px 12px;border-top:1px solid ${LINE};background:#fafafa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${FONT}font-size:14px;color:${INK};"><tr>
<td style="color:${MUTED};">Qty ${line.quantity}</td>
<td align="right" style="font-weight:700;white-space:nowrap;">${escapeHtml(gift ? 'Free' : formatEgp(line.lineEgp))}</td>
</tr></table>
</td></tr>
</table>`;
    })
    .join('\n');
  return `<p style="margin:24px 0 10px;font-size:13px;font-weight:700;letter-spacing:1px;color:${MUTED};">ITEMS (${count})</p>
${cards}`;
}

function totalsTable(order: OrderEmailOrder, totalLabel: string): string {
  const rows = totalsRows(order, totalLabel)
    .map(([label, value], index, all) => {
      const isTotal = index === all.length - 1;
      const weight = isTotal ? 'font-weight:700;' : '';
      // A line above the total only; the item cards already close off the list.
      const border = isTotal ? `border-top:1px solid ${LINE};` : '';
      const pad = isTotal ? 'padding:10px 0 6px;' : 'padding:6px 0;';
      return `<tr>
<td style="${pad}${border}${weight}">${escapeHtml(label)}</td>
<td align="right" style="${pad}${border}${weight}">${escapeHtml(value)}</td>
</tr>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;${FONT}font-size:14px;color:${INK};">
${rows}
</table>`;
}

/** A bold label with one value per line (customer details, delivery address). */
function labelledLines(label: string, lines: readonly string[]): string {
  const body = lines.map(escapeHtml).join('<br>');
  return `<p style="margin:20px 0 0;font-size:14px;word-break:break-word;"><strong>${escapeHtml(label)}</strong><br>${body}</p>`;
}

function addressBlock(order: OrderEmailOrder): string {
  return labelledLines('Delivery Address', addressLines(order));
}

/** `filled`: black, for the shopper's main action. `tonal`: light grey, readable in light and dark mail apps. */
export function buttonHtml(button: EmailButton, variant: 'filled' | 'tonal' = 'filled'): string {
  const colors =
    variant === 'tonal' ? `background:${TONAL};color:${INK};` : `background:${INK};color:#ffffff;`;
  return `<p style="margin:24px 0 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 20px;${colors}text-decoration:none;font-weight:600;border-radius:2px;">${escapeHtml(button.label)}</a></p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
