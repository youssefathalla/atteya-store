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
import type { OrderEmailLine, OrderEmailOrder } from './order-email-model.js';

/**
 * Order email copy. Agreed wording lives on the "Order emails with Resend" board task;
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
    case 'paid-confirmed':
      return paidConfirmed(order, ctx);
    case 'payment-failed':
      return paymentFailed(order, ctx);
    case 'store-new-order':
      return storeNewOrder(order, ctx);
  }
}

// ── Shopper emails ───────────────────────────────────────────────────────────

function codPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const cash = formatEgp(cashOnDeliveryEgp(order));
  const feeFirst = order.shippingEgp > 0;
  const payNow = feeFirst
    ? `To send it out, we first need the shipping fee of ${formatEgp(order.shippingEgp)} by InstaPay. You'll pay the rest, ${cash}, in cash when it arrives.`
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
  return shopperEmail(order, ctx, {
    subject: `We got your order ${order.ref}`,
    heading: `Thanks for your order, ${firstName(order)}`,
    intro: [
      `We've received your order ${order.ref}. Once your InstaPay transfer arrives, we'll confirm it and get your order ready.`,
    ],
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
    button: ctx.storefrontUrl ? { label: 'Shop again', url: `${ctx.storefrontUrl}/shop` } : null,
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
    parts.showAddress ? `Delivery address:\n${addressLines(order).join('\n')}` : null,
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
        ? 'InstaPay – waiting for transfer'
        : 'Paid Online';
  const subject = `New order ${order.ref} – ${formatEgp(order.totalEgp)} – ${label}`;
  const cash = formatEgp(cashOnDeliveryEgp(order));
  const payment =
    method === 'cash-on-delivery'
      ? order.shippingEgp > 0
        ? `Cash on Delivery. Collect the shipping fee of ${formatEgp(order.shippingEgp)} by InstaPay first, then ${cash} on delivery.`
        : `Cash on Delivery. No shipping fee to collect (free shipping). Collect ${cash} on delivery.`
      : method === 'instapay'
        ? `InstaPay. Waiting for the shopper's transfer of ${formatEgp(order.totalEgp)}. Confirm the payment in the dashboard once it shows in your bank app.`
        : `Paid Online (Card or Wallet): ${formatEgp(order.totalEgp)}.`;
  const warning = order.needsReview
    ? 'One item sold out before this payment came in. Please check this order.'
    : null;
  const customer = [
    order.address.fullName,
    order.address.phone,
    order.customerEmail,
  ].filter((part): part is string => Boolean(part));
  const button = ctx.storefrontUrl
    ? { label: 'Open orders in the dashboard', url: `${ctx.storefrontUrl}/admin/orders` }
    : null;

  const html = layout(ctx.storeName, subject, [
    h1(`New order ${order.ref}`),
    warning ? highlightBox(`⚠ ${warning}`) : '',
    highlightBox(payment),
    paragraph(customer.map(escapeHtml).join(' · '), true),
    itemsTable(order.lines, ctx),
    totalsTable(order, 'Total'),
    addressBlock(order),
    button ? buttonHtml(button) : '',
  ]);
  const text = joinText([
    `New order ${order.ref}`,
    warning,
    payment,
    customer.join(' · '),
    itemsText(order.lines),
    totalsText(order, 'Total'),
    `Delivery address:\n${addressLines(order).join('\n')}`,
    button ? `${button.label}: ${button.url}` : null,
  ]);
  return { subject, html, text };
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
    shippingEgp: order.shippingEgp,
    totalEgp: order.totalEgp,
    needsReview: order.needsReview,
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
  const what = due.reason === 'shipping-fee' ? `the shipping fee of${amount}` : amount.trim() || 'the total';
  const waUrl = whatsappChatUrl(ctx.whatsappNumber, shopperWhatsappText(stage, input, ctx.instapay));
  const details = hasInstapayDetails(ctx.instapay);
  const lines: string[] = [];

  if (details) {
    lines.push(`Pay ${what} by InstaPay:`);
    const address = ctx.instapay.address.trim();
    const number = ctx.instapay.number.trim();
    if (address) lines.push(`InstaPay address: ${address}`);
    if (number) lines.push(`InstaPay number: ${number}`);
    lines.push(
      waUrl
        ? 'Then send us the screenshot on WhatsApp.'
        : ctx.canReply
          ? 'Then reply to this email with the screenshot.'
          : 'Then send us the screenshot.',
    );
  } else {
    lines.push(`Pay ${what} by InstaPay.`);
    lines.push(
      waUrl
        ? "Message us on WhatsApp and we'll send you the InstaPay details."
        : "We'll send you the InstaPay details.",
    );
  }

  return {
    lines,
    whatsapp: waUrl
      ? { label: details ? 'Send screenshot on WhatsApp' : 'Message us on WhatsApp', url: waUrl }
      : null,
  };
}

function payBoxText(box: PayBox): string {
  const button = box.whatsapp ? `\n${box.whatsapp.label}: ${box.whatsapp.url}` : '';
  return `${box.lines.join('\n')}${button}`;
}

interface EmailButton {
  readonly label: string;
  readonly url: string;
}

function orderButton(order: OrderEmailOrder, ctx: OrderEmailContext): EmailButton | null {
  if (!ctx.storefrontUrl) return null;
  return {
    label: 'View your order',
    url: `${ctx.storefrontUrl}/checkout/confirmation/${encodeURIComponent(order.id)}`,
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
  const options = line.optionLabels.map((opt) => `${opt.label}: ${opt.value}`);
  return [...options, `Qty ${line.quantity}`].join(' · ');
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
  return `${ctx.imageBaseUrl}/${clean}?tr=w-128,h-160,c-at_max`;
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
  return [
    ['Subtotal', formatEgp(order.subtotalEgp)],
    ['Shipping', order.shippingEgp > 0 ? formatEgp(order.shippingEgp) : 'Free'],
    [totalLabel, formatEgp(order.totalEgp)],
  ];
}

function itemsText(lines: readonly OrderEmailLine[]): string {
  return lines
    .map((line) => `- ${lineTitle(line)} (${lineDetails(line)}): ${formatEgp(line.lineEgp)}`)
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

function layout(storeName: string, title: string, blocks: readonly string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${LINE};${FONT}font-size:18px;font-weight:700;letter-spacing:2px;color:${INK};">${escapeHtml(storeName.toUpperCase())}</td></tr>
<tr><td style="padding:24px;${FONT}color:${INK};font-size:15px;line-height:1.5;">
${blocks.filter(Boolean).join('\n')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function h1(textValue: string): string {
  return `<h1 style="margin:0 0 16px;${FONT}font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(textValue)}</h1>`;
}

function paragraph(textValue: string, alreadyEscaped = false): string {
  const body = alreadyEscaped ? textValue : escapeHtml(textValue);
  return `<p style="margin:0 0 12px;">${body}</p>`;
}

function smallText(textValue: string): string {
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

function itemsTable(lines: readonly OrderEmailLine[], ctx: OrderEmailContext): string {
  const rows = lines
    .map((line) => {
      const src = imageUrl(line.imagePath, ctx);
      // No photo: the name cell takes the photo column too, so there's no empty gap.
      const photoCell = src
        ? `<td width="72" valign="top" style="padding:10px 8px 10px 0;border-top:1px solid ${LINE};"><img src="${escapeHtml(src)}" width="64" alt="" style="display:block;width:64px;height:auto;border:0;"></td>\n`
        : '';
      const nameSpan = src ? '' : ' colspan="2"';
      return `<tr>
${photoCell}<td${nameSpan} valign="top" style="padding:10px 8px 10px 0;border-top:1px solid ${LINE};">
<div style="font-weight:600;">${escapeHtml(lineTitle(line))}</div>
<div style="font-size:13px;color:${MUTED};">${escapeHtml(lineDetails(line))}</div>
</td>
<td valign="top" align="right" style="padding:10px 0;border-top:1px solid ${LINE};white-space:nowrap;">${escapeHtml(formatEgp(line.lineEgp))}</td>
</tr>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;${FONT}font-size:14px;color:${INK};">
${rows}
</table>`;
}

function totalsTable(order: OrderEmailOrder, totalLabel: string): string {
  const rows = totalsRows(order, totalLabel)
    .map(([label, value], index, all) => {
      const isTotal = index === all.length - 1;
      const weight = isTotal ? 'font-weight:700;' : '';
      const border = index === 0 ? `border-top:1px solid ${LINE};` : '';
      return `<tr>
<td style="padding:6px 0;${border}${weight}">${escapeHtml(label)}</td>
<td align="right" style="padding:6px 0;${border}${weight}">${escapeHtml(value)}</td>
</tr>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;${FONT}font-size:14px;color:${INK};">
${rows}
</table>`;
}

function addressBlock(order: OrderEmailOrder): string {
  const lines = addressLines(order).map(escapeHtml).join('<br>');
  return `<p style="margin:20px 0 0;font-size:14px;"><strong>Delivery address</strong><br>${lines}</p>`;
}

function buttonHtml(button: EmailButton): string {
  return `<p style="margin:24px 0 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 20px;background:${INK};color:#ffffff;text-decoration:none;font-weight:600;border-radius:2px;">${escapeHtml(button.label)}</a></p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
