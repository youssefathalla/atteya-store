/**
 * Return and exchange emails, built from the "Bold Black" blocks in `email-blocks.ts`: the staff
 * alert `store-return-request` and the shopper's `return-requested` ("Request Sent") from ATS-291,
 * and the shopper's status emails from ATS-294: `return-approved`, `return-rejected`,
 * `return-received` and `return-refund-sent`. Pure, unit tested in `returns/returns.test.ts` and
 * `email/return-emails.test.ts`. Amounts are whole EGP from the saved request.
 */
import { shopperWhatsappNumber } from '../store/order-messages.js';
import { returnPhotosWhatsappText, returnStaffWhatsappText } from '../store/returns.js';
import { whatsappChatUrl } from '../store/store-info.js';
import {
  amountBlock,
  emailDocument,
  escapeHtml,
  FONT,
  footer,
  GREY_BOX,
  fullWidthLink,
  header,
  INK,
  itemGrid,
  mainButton,
  nextStepBox,
  outlinedButton,
  paragraphHtml,
  section,
  sectionTitle,
  siteLabel,
  staffHeader,
  statStrip,
  steps,
  TEXT_MUTED,
  totals,
  type AmountCell,
  type EmailButton,
  type EmailStep,
  type ItemCard,
} from './email-blocks.js';
import { orderConfirmationUrl } from './order-email-model.js';
import { formatEgp, imageUrl, type OrderEmailContext, type RenderedEmail } from './order-email-templates.js';
import type { ReturnEmailKind } from './return-email-events.js';
import type { ReturnEmailItem, ReturnEmailRequest } from './return-email-model.js';

export function renderReturnEmail(
  kind: ReturnEmailKind,
  request: ReturnEmailRequest,
  ctx: OrderEmailContext,
): RenderedEmail {
  switch (kind) {
    case 'store-return-request':
      return storeReturnRequest(request, ctx);
    case 'return-requested':
      return returnRequested(request, ctx);
    case 'return-approved':
      return returnApproved(request, ctx);
    case 'return-rejected':
      return returnRejected(request, ctx);
    case 'return-received':
      return returnReceived(request, ctx);
    case 'return-refund-sent':
      return returnRefundSent(request, ctx);
  }
}

const SPACER = '<tr><td style="height:40px;font-size:0;line-height:0;">&nbsp;</td></tr>';

// ── Shopper: Request Sent ───────────────────────────────────────────────────

function returnRequested(request: ReturnEmailRequest, ctx: OrderEmailContext): RenderedEmail {
  const first = firstName(request.customer.name);
  const sentence = `Thanks, ${first}. We'll look at it and message you on WhatsApp to arrange the courier.`;
  const subject = `We got your return or exchange request ${request.ref}`;
  const kicker = `Return or Exchange · ${request.ref}`;

  const stepList = shopperSteps(request);
  const cards = itemCards(request, ctx, false);
  const rows = shopperTotals(request);
  const view = viewButton(request, ctx);
  const waNumber = ctx.whatsappNumber.trim();
  const photos = request.storeFault
    ? whatsappChatUrl(waNumber, returnPhotosWhatsappText(request.ref, request.orderRef))
    : null;
  const photosNote = 'Please send us a photo of the item so we can sort it quickly. Delivery is on us.';
  const photosButton: EmailButton | null = photos ? { label: 'Send Photos on WhatsApp', url: photos } : null;
  const replyNote = ctx.canReply ? 'Please reply to this email with a photo of the item.' : null;
  const help = footerHelp(ctx, photosButton !== null);

  const html = emailDocument(subject, [
    header({
      storeName: ctx.storeName,
      ref: request.orderRef,
      kicker,
      status: ['Request', 'Sent'],
      sentence,
    }),
    section(sectionTitle('What Happens Next'), 40),
    steps(stepList),
    section(`${sectionTitle('Your Items')}${itemGrid(cards)}`, 40),
    section(totals(rows.rows, rows.after), 8),
    view ? mainButton(view) : '',
    request.storeFault && (photosButton || replyNote)
      ? section(photoBox(photosNote, photosButton, replyNote), 28)
      : '',
    SPACER,
    footer({
      storeName: ctx.storeName,
      line: help.line,
      button: help.button,
      site: siteLabel(ctx.storefrontUrl),
      siteUrl: ctx.storefrontUrl,
    }),
  ]);
  const text = joinText([
    `REQUEST SENT\n${kicker} · Order ${request.orderRef}`,
    sentence,
    `What Happens Next:\n${stepList.map((step, index) => `${index + 1}. ${step.title}${step.note ? `\n   ${step.note}` : ''}`).join('\n')}`,
    `Your Items:\n${itemsText(request, false)}`,
    [...rows.rows, ...rows.after].map(([label, value]) => `${label}: ${value}`).join('\n'),
    view ? `${view.label}: ${view.url}` : null,
    request.storeFault
      ? joinLines([photosNote, photosButton ? `${photosButton.label}: ${photosButton.url}` : replyNote])
      : null,
    help.text,
  ]);
  return { subject, html, text };
}

function shopperSteps(request: ReturnEmailRequest): EmailStep[] {
  const where = joinWith([request.customer.line1, request.customer.city], ', ') || 'your address';
  const exchange = request.items.some((item) => !item.autoGift && !item.refund);
  const courier = exchange
    ? request.hasRefund
      ? `Our courier comes to ${where}, takes the items and brings your new pieces.`
      : `Our courier comes to ${where} and swaps the items at your door.`
    : `Our courier comes to ${where} to collect the items.`;
  const feeNote =
    request.cashAtDoorEgp > 0
      ? `Please pay the courier ${formatEgp(request.cashAtDoorEgp)} in cash.`
      : request.feeEgp === 0
        ? 'The courier visit is on us.'
        : null;
  const list: EmailStep[] = [
    { state: 'current', title: 'We check your request, usually the same day.' },
    { state: 'current', title: courier, note: feeNote },
  ];
  if (request.hasRefund) {
    list.push({
      state: 'current',
      title:
        request.refundEgp > 0
          ? `Once they're back with us, we send ${formatEgp(request.refundEgp)} to your InstaPay.`
          : "Once they're back with us, we settle your refund on InstaPay.",
    });
  }
  return list;
}

function shopperTotals(request: ReturnEmailRequest): {
  rows: [string, string][];
  after: [string, string][];
} {
  const fee = request.feeEgp > 0 ? formatEgp(request.feeEgp) : 'Free';
  if (request.hasRefund) {
    return {
      rows: [
        ['Returned items', formatEgp(request.itemsEgp)],
        ['Courier fee', request.feeEgp > 0 ? `− ${fee}` : fee],
        ['Your refund', formatEgp(request.refundEgp)],
      ],
      after: request.cashAtDoorEgp > 0 ? [['Cash to the courier', formatEgp(request.cashAtDoorEgp)]] : [],
    };
  }
  return { rows: [[request.feeEgp > 0 ? 'Courier fee, cash at your door' : 'Courier fee', fee]], after: [] };
}

/** Dashed box for damaged or wrong items: send photos on WhatsApp (or reply with them). */
function photoBox(note: string, button: EmailButton | null, replyNote: string | null): string {
  const action = button
    ? `<div style="margin-top:14px;">${fullWidthLink(button, 'outlined')}</div>`
    : replyNote
      ? paragraphHtml(replyNote, TEXT_MUTED, 14)
      : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #cccccc;"><tr><td style="padding:20px 22px;">
<p style="margin:0 0 8px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">DAMAGED OR WRONG ITEM</p>
<p style="margin:0;${FONT}font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(note)}</p>
${action}
</td></tr></table>`;
}

/** Footer help: WhatsApp when set (no second WhatsApp button when the email has one), else reply. */
function footerHelp(
  ctx: OrderEmailContext,
  hasWhatsappButton: boolean,
): { line: string | null; button: EmailButton | null; text: string | null } {
  const waNumber = ctx.whatsappNumber.trim();
  const waLink = whatsappChatUrl(waNumber);
  if (waLink) {
    const said = 'Questions? We answer on WhatsApp.';
    const button = hasWhatsappButton ? null : { label: 'Message Us on WhatsApp', url: waLink };
    return { line: said, button, text: button ? `${said}\n${button.label}: ${waNumber} (${waLink})` : said };
  }
  const reply = ctx.canReply ? 'Questions? Just reply to this email.' : null;
  return { line: reply, button: null, text: reply };
}

// ── Shopper: status emails (ATS-294) ────────────────────────────────────────

/** One part of a status email: its HTML rows and the matching plain-text block (same order). */
interface EmailPart {
  readonly html: string;
  readonly text: string | null;
}

/**
 * The frame every shopper status email shares: the black header (kicker `RETURN OR EXCHANGE ·
 * #R-…`, the order ref on the right), the parts, **View Your Order**, then the footer.
 */
function shopperStatusEmail(
  request: ReturnEmailRequest,
  ctx: OrderEmailContext,
  parts: {
    readonly subject: string;
    readonly status: readonly string[];
    readonly sentence: string;
    readonly body: readonly EmailPart[];
    readonly hasWhatsappButton?: boolean;
  },
): RenderedEmail {
  const kicker = `Return or Exchange · ${request.ref}`;
  const view = viewButton(request, ctx);
  const help = footerHelp(ctx, parts.hasWhatsappButton === true);
  const html = emailDocument(parts.subject, [
    header({
      storeName: ctx.storeName,
      ref: request.orderRef,
      kicker,
      status: [...parts.status],
      sentence: parts.sentence,
    }),
    ...parts.body.map((part) => part.html),
    view ? mainButton(view) : '',
    SPACER,
    footer({
      storeName: ctx.storeName,
      line: help.line,
      button: help.button,
      site: siteLabel(ctx.storefrontUrl),
      siteUrl: ctx.storefrontUrl,
    }),
  ]);
  const text = joinText([
    `${parts.status.join(' ').toUpperCase()}\n${kicker} · Order ${request.orderRef}`,
    parts.sentence,
    ...parts.body.map((part) => part.text),
    view ? `${view.label}: ${view.url}` : null,
    help.text,
  ]);
  return { subject: parts.subject, html, text };
}

function viewButton(request: ReturnEmailRequest, ctx: OrderEmailContext): EmailButton | null {
  return ctx.storefrontUrl
    ? {
        label: 'View Your Order',
        url: orderConfirmationUrl(ctx.storefrontUrl, request.orderId, request.viewKey),
      }
    : null;
}

/** The items as cards, with the plain-text list. */
function itemsPart(request: ReturnEmailRequest, ctx: OrderEmailContext, giftNote: GiftNote): EmailPart {
  return {
    html: section(`${sectionTitle('Your Items')}${itemGrid(itemCards(request, ctx, false, giftNote))}`, 40),
    text: `Your Items:\n${itemsText(request, false, giftNote)}`,
  };
}

/** A small grey label over a line of text ("HAND OVER", "YOU GET", "AMOUNT"). */
function labelled(label: string, value: string, padTop = 32): EmailPart {
  return {
    html: section(
      `<p style="margin:0 0 8px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">${escapeHtml(label.toUpperCase())}</p>
<p style="margin:0;${FONT}font-size:16px;line-height:1.55;color:${INK};">${escapeHtml(value)}</p>`,
      padTop,
    ),
    text: `${label}: ${value}`,
  };
}

/** Text in a grey box (the courier fee line, staff's reason). */
function greyBox(value: string, label: string | null, padTop = 24): EmailPart {
  const labelHtml = label
    ? `<p style="margin:0 0 8px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">${escapeHtml(label.toUpperCase())}</p>\n`
    : '';
  return {
    html: section(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GREY_BOX};"><tr><td style="padding:18px 20px;">
${labelHtml}<p style="margin:0;${FONT}font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(value)}</p>
</td></tr></table>`,
      padTop,
    ),
    text: label ? `${label}: ${value}` : value,
  };
}

// Approved

function returnApproved(request: ReturnEmailRequest, ctx: OrderEmailContext): RenderedEmail {
  return shopperStatusEmail(request, ctx, {
    subject: `Your return or exchange ${request.ref} is approved`,
    status: ['Request', 'Approved'],
    sentence: 'Our courier will come to your delivery address.',
    body: [
      labelled('Hand Over', handOverText(request)),
      labelled('You Get', youGetText(request), 20),
      greyBox(approvedFeeLine(request), null),
    ],
  });
}

/** Every piece the courier takes, free gifts going back included: `Padel Shorts · M, Sport Socks`. */
function handOverText(request: ReturnEmailRequest): string {
  return listText(
    request.items.map((item) => {
      const count = item.quantity > 1 ? `${item.quantity} × ` : '';
      // The shopper holds the piece we sent by mistake, not the one on the order.
      return item.kind === 'wrong-item'
        ? `${count}the item we sent instead of ${itemTitle(item)}`
        : `${count}${itemTitle(item)}`;
    }),
  );
}

/** New pieces for exchanges, then the refund: `Padel Shorts in L, and EGP 580 by InstaPay once they're back`. */
function youGetText(request: ReturnEmailRequest): string {
  const parts: string[] = [];
  for (const item of request.items) {
    if (item.autoGift || item.refund) continue;
    const name = item.name || 'Item';
    const count = item.quantity > 1 ? `${item.quantity} × ` : '';
    if (item.kind === 'different-size' || item.kind === 'different-colour') {
      const arrow = item.askedLabel.indexOf('→');
      const next = arrow >= 0 ? item.askedLabel.slice(arrow + 1).trim() : '';
      parts.push(next ? `${count}${name} in ${next}` : `${count}${name} in your new choice`);
    } else if (item.kind === 'damaged') {
      parts.push(item.quantity > 1 ? `${item.quantity} new ${name}` : `a new ${name}`);
    } else if (item.kind === 'wrong-item') {
      parts.push(`the right ${name}${item.quantity > 1 ? ` (×${item.quantity})` : ''}`);
    }
  }
  if (request.hasRefund) {
    parts.push(
      request.refundEgp > 0
        ? `${formatEgp(request.refundEgp)} by InstaPay once they're back`
        : 'no refund, as the courier fee covers the items',
    );
  }
  const text =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : (parts[0] ?? '');
  return capitalise(text) || 'Your request as you sent it';
}

/** The courier fee: free, cash at the door, or taken off the refund. */
function approvedFeeLine(request: ReturnEmailRequest): string {
  if (request.feeEgp === 0) return 'The courier visit is free.';
  const fee = formatEgp(request.feeEgp);
  if (request.feePaid === 'cash') return `Courier fee ${fee}, cash at your door.`;
  const cash =
    request.cashAtDoorEgp > 0
      ? ` Please pay the courier the other ${formatEgp(request.cashAtDoorEgp)} in cash.`
      : '';
  return `Courier fee ${fee}, taken off your refund.${cash}`;
}

// Rejected

function returnRejected(request: ReturnEmailRequest, ctx: OrderEmailContext): RenderedEmail {
  const waNumber = ctx.whatsappNumber.trim();
  const waLink = whatsappChatUrl(waNumber);
  const wa: EmailButton | null = waLink ? { label: 'Message Us on WhatsApp', url: waLink } : null;
  const body: EmailPart[] = [];
  if (request.rejectReason) body.push(greyBox(`"${request.rejectReason}"`, 'Our Reason'));
  if (wa) {
    body.push({
      html: section(fullWidthLink(wa, 'outlined'), 24),
      text: `${wa.label}: ${waNumber} (${wa.url})`,
    });
  }
  body.push(itemsPart(request, ctx, 'stays'));
  return shopperStatusEmail(request, ctx, {
    subject: `About your return or exchange request ${request.ref}`,
    status: ["We Can't", 'Take It Back'],
    sentence: "We looked at your request and can't accept it this time.",
    body,
    hasWhatsappButton: wa !== null,
  });
}

// Received

function returnReceived(request: ReturnEmailRequest, ctx: OrderEmailContext): RenderedEmail {
  const exchange = request.items.some((item) => !item.autoGift && !item.refund);
  const got = exchange ? 'We got your items, and your new pieces are with you.' : 'We got your items.';
  const sentence = !request.hasRefund
    ? 'Your exchange is done. Enjoy your new pieces!'
    : request.refundEgp > 0
      ? `${got} Your refund of ${formatEgp(request.refundEgp)} is on its way by InstaPay.`
      : `${got} The courier fee covered the refund, so there is nothing more to send.`;
  return shopperStatusEmail(request, ctx, {
    subject: request.hasRefund
      ? `We got your items for ${request.ref}`
      : `Your exchange ${request.ref} is done`,
    status: ['Items', 'Received'],
    sentence,
    body: [itemsPart(request, ctx, 'came-back')],
  });
}

// Refund Sent

function returnRefundSent(request: ReturnEmailRequest, ctx: OrderEmailContext): RenderedEmail {
  const amount = formatEgp(request.refundSentEgp);
  const to = lastFour(request.refundTo);
  const sentLine = joinWith(
    [
      to ? `Sent by InstaPay to …${to}` : 'Sent by InstaPay',
      request.refundReference ? `Reference ${request.refundReference}` : null,
    ],
    ' · ',
  );
  return shopperStatusEmail(request, ctx, {
    subject: `Refund Sent: ${amount} for ${request.ref}`,
    status: ['Refund', 'Sent'],
    sentence: `We sent your refund of ${amount}. It can take a little while to show in your account.`,
    body: [
      {
        html: amountBlock([{ label: 'Amount', amount, note: sentLine }]),
        text: `Amount: ${amount}\n${sentLine}`,
      },
      // Only the items paid back (and gifts that went with them), not the exchanged ones.
      itemsPart(
        { ...request, items: request.items.filter((item) => item.refund || item.autoGift) },
        ctx,
        'came-back',
      ),
    ],
  });
}

/**
 * Only the last 4 characters of an InstaPay number (spaces left out), never the whole thing. For an
 * address (`name@instapay`) the last 4 characters of the name, so it isn't always `…apay`.
 */
function lastFour(value: string | null): string | null {
  const compact = (value ?? '').replace(/\s+/g, '');
  if (!compact) return null;
  const at = compact.lastIndexOf('@');
  if (at > 0) return `${compact.slice(Math.max(0, at - 4), at)}${compact.slice(at)}`;
  return compact.slice(-4);
}

function listText(parts: readonly string[]): string {
  return parts.filter((part) => part.trim()).join(', ');
}

function capitalise(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

// ── Staff alert ─────────────────────────────────────────────────────────────

const STAFF_FOOTER = 'Sent to the store team for every return or exchange request.';

function storeReturnRequest(request: ReturnEmailRequest, ctx: OrderEmailContext): RenderedEmail {
  const what = request.hasRefund ? `Refund ${formatEgp(request.refundEgp)}` : 'Exchange';
  const subject = `Return Request ${request.ref} – Order ${request.orderRef} – ${what}`;
  const when = cairoDateTime(request.createdAtMs);
  const kicker = when ? `Return Request · ${when}` : 'Return Request';
  const delivered = shortDate(request.deliveredAtMs);
  const refLine = `For order ${request.orderRef}${delivered ? ` · delivered ${delivered}` : ''}`;

  const strip: AmountCell[] = [
    { label: 'Items', amount: String(request.items.reduce((sum, item) => sum + item.quantity, 0)) },
    { label: 'Refund', amount: request.hasRefund ? formatEgp(request.refundEgp) : 'None' },
    {
      label: 'Courier Fee',
      amount: request.feeEgp > 0 ? formatEgp(request.feeEgp) : 'Free',
      note: feeNote(request),
    },
  ];
  const exchange = request.items.some((item) => !item.autoGift && !item.refund && item.kind !== 'return');
  const stepNote = joinWith(
    [
      'Message the customer to arrange the courier.',
      exchange ? 'Approving takes the new pieces from stock.' : null,
      request.storeFault ? 'Ask for photos of the damaged or wrong item.' : null,
    ],
    ' ',
  );
  const customer = staffCustomer(request, ctx);
  const cards = itemCards(request, ctx, true);
  const money = staffTotals(request);
  const button = ctx.storefrontUrl
    ? { label: 'Open Request', url: `${ctx.storefrontUrl}/admin/returns/${encodeURIComponent(request.id)}` }
    : null;

  const html = emailDocument(subject, [
    staffHeader({
      storeName: ctx.storeName,
      kicker,
      amount: request.ref,
      amountNote: null,
      refLine,
      sentence: null,
    }),
    statStrip(strip),
    section(nextStepBox('Approve or reject this request', stepNote), 32),
    customer.html,
    section(`${sectionTitle('What They Asked For')}${itemGrid(cards)}`, 40),
    request.note
      ? section(`${sectionTitle("Customer's Note")}${paragraphHtml(`"${request.note}"`)}`, 16)
      : '',
    section(
      `${totals(money.rows)}${money.after ? `<p style="margin:8px 0 0;${FONT}font-size:14px;line-height:1.5;color:${TEXT_MUTED};">${escapeHtml(money.after)}</p>` : ''}`,
      16,
    ),
    button ? mainButton(button) : '',
    SPACER,
    footer({
      storeName: ctx.storeName,
      line: STAFF_FOOTER,
      button: null,
      site: '',
      siteUrl: '',
      wordmark: false,
    }),
  ]);
  const text = joinText([
    joinLines([kicker, request.ref, refLine]),
    strip.map((cell) => `${cell.label}: ${cell.amount}${cell.note ? ` (${cell.note})` : ''}`).join('\n'),
    joinLines(['Next Step: Approve or reject this request', stepNote]),
    customer.text,
    `What They Asked For:\n${itemsText(request, true)}`,
    request.note ? `Customer's Note: "${request.note}"` : null,
    joinLines([money.rows.map(([label, value]) => `${label}: ${value}`).join('\n'), money.after]),
    button ? `${button.label}: ${button.url}` : null,
    STAFF_FOOTER,
  ]);
  return { subject, html, text };
}

function feeNote(request: ReturnEmailRequest): string | null {
  switch (request.feePaid) {
    case 'off-refund':
      return 'off the refund';
    case 'cash':
      return 'cash at the door';
    default:
      return request.storeFault ? 'the store pays' : null;
  }
}

function staffTotals(request: ReturnEmailRequest): { rows: [string, string][]; after: string | null } {
  const fee = request.feeEgp > 0 ? formatEgp(request.feeEgp) : 'Free';
  if (request.hasRefund) {
    const to = request.refundTo ? `To ${request.refundTo}, after the items are received.` : null;
    const cash =
      request.cashAtDoorEgp > 0
        ? `The customer pays the courier ${formatEgp(request.cashAtDoorEgp)} in cash.`
        : null;
    return {
      rows: [
        ['Returned items', formatEgp(request.itemsEgp)],
        ['Courier fee', request.feeEgp > 0 ? `− ${fee}` : fee],
        ['Refund by InstaPay', formatEgp(request.refundEgp)],
      ],
      after: joinWith([to, cash], ' ') || null,
    };
  }
  return { rows: [[request.feeEgp > 0 ? 'Courier fee, cash at the door' : 'Courier fee', fee]], after: null };
}

function staffCustomer(request: ReturnEmailRequest, ctx: OrderEmailContext): { html: string; text: string } {
  const c = request.customer;
  const where = joinWith([c.line1, c.line2, c.city], ', ');
  const greyLine = joinWith([where, c.guest ? 'Guest checkout' : 'Account'], ' · ');
  const phone = c.phone.trim();
  const email = c.email ?? '';
  const phoneHtml = phone
    ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}" style="color:${INK};font-weight:600;text-decoration:underline;">${escapeHtml(phone)}</a>`
    : '';
  const contactHtml = [phoneHtml, email ? escapeHtml(email) : ''].filter(Boolean).join(' · ');
  const waNumber = shopperWhatsappNumber(c.phone, c.country);
  const waUrl = waNumber
    ? whatsappChatUrl(waNumber, returnStaffWhatsappText(request.ref, request.orderRef, c.name, ctx.storeName))
    : null;
  const wa = waUrl ? { label: 'Message Customer on WhatsApp', url: waUrl } : null;
  const html = section(
    `<p style="margin:0 0 10px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">CUSTOMER</p>
<p style="margin:0;${FONT}font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:${INK};word-break:break-word;">${escapeHtml(c.name || 'Customer')}</p>
${contactHtml ? `<p style="margin:10px 0 0;${FONT}font-size:15px;line-height:1.5;color:${INK};word-break:break-word;">${contactHtml}</p>` : ''}
${greyLine ? `<p style="margin:6px 0 0;${FONT}font-size:14px;line-height:1.5;color:${TEXT_MUTED};word-break:break-word;">${escapeHtml(greyLine)}</p>` : ''}
${wa ? `<div style="margin-top:18px;">${outlinedButton(wa)}</div>` : ''}`,
    36,
  );
  const text = joinLines([
    `Customer: ${c.name || 'Customer'}`,
    phone ? `Phone: ${phone}` : null,
    email ? `Email: ${email}` : null,
    greyLine || null,
    wa ? `${wa.label}: ${wa.url}` : null,
  ]);
  return { html, text };
}

// ── Shared parts ────────────────────────────────────────────────────────────

/**
 * One card per item the shopper chose; a gift that comes back with a refund is a strip under the
 * item it came with. Staff cards carry a black `×2` tag and the refund amount.
 */
function itemCards(
  request: ReturnEmailRequest,
  ctx: OrderEmailContext,
  staff: boolean,
  giftNote: GiftNote = 'hand-back',
): ItemCard[] {
  const chosen = request.items.filter((item) => !item.autoGift);
  const gifts = request.items.filter((item) => item.autoGift);
  const width = chosen.length > 4 ? 128 : 520;
  // Each returned gift shows once, under the first refunded card of the line it came with.
  const giftOwner = new Map<number, ReturnEmailItem>();
  for (const item of chosen) {
    if (item.refund && !giftOwner.has(item.lineIndex)) giftOwner.set(item.lineIndex, item);
  }
  const cards: ItemCard[] = chosen.map((item) => {
    const own =
      giftOwner.get(item.lineIndex) === item ? gifts.filter((gift) => gift.forLine === item.lineIndex) : [];
    return {
      name: itemTitle(item),
      details: staff
        ? item.askedLabel
        : joinWith([item.askedLabel, item.quantity > 1 ? `Qty ${item.quantity}` : null], ' · '),
      price: staff && item.refund ? formatEgp(item.refundEgp) : null,
      imageSrc: imageUrl(item.imagePath, ctx, width),
      tags: staff ? [`×${item.quantity}`] : [],
      ...(own.length ? { gifts: own.map((gift) => giftStrip(gift, item, staff, giftNote)) } : {}),
    };
  });
  // A gift whose item isn't in the list (should not happen) still shows as its own card.
  for (const gift of gifts) {
    if (chosen.some((item) => item.refund && item.lineIndex === gift.forLine)) continue;
    cards.push({
      name: itemTitle(gift),
      details: gift.askedLabel,
      price: null,
      imageSrc: imageUrl(gift.imagePath, ctx, width),
      tags: staff ? [`×${gift.quantity}`] : [],
    });
  }
  return cards;
}

/**
 * What the shopper's gift strip says: `hand-back` before the courier comes, `came-back` once the
 * items are with us, `stays` when the request was rejected.
 */
type GiftNote = 'hand-back' | 'came-back' | 'stays';

function giftStrip(
  gift: ReturnEmailItem,
  item: ReturnEmailItem,
  staff: boolean,
  note: GiftNote,
): { name: string; details: string } {
  const owner = item.name || 'the item';
  const name = gift.name || 'Free gift';
  if (staff) return { name, details: `×${gift.quantity} · comes back with the ${owner}` };
  switch (note) {
    case 'came-back':
      return { name, details: `Came back with the ${owner}.` };
    case 'stays':
      return { name, details: `Stays with the ${owner}.` };
    default:
      return { name, details: `Please hand it back with the ${owner}.` };
  }
}

function itemsText(request: ReturnEmailRequest, staff: boolean, giftNote: GiftNote = 'hand-back'): string {
  return request.items
    .map((item) => {
      const head = `${item.autoGift ? '  + ' : '- '}×${item.quantity} ${itemTitle(item)}`;
      const money = staff && item.refund ? ` · ${formatEgp(item.refundEgp)}` : '';
      const owner = request.items.find((other) => !other.autoGift && other.lineIndex === item.forLine);
      const asked =
        !staff && item.autoGift && giftNote !== 'hand-back' && owner
          ? `Free gift · ${giftStrip(item, owner, false, giftNote).details}`
          : item.askedLabel;
      return `${head}: ${asked}${money}`;
    })
    .join('\n');
}

/** "Padel Shorts · Black · L": the name and the line's chosen options. */
function itemTitle(item: ReturnEmailItem): string {
  return joinWith([item.name || 'Item', ...optionTags(item)], ' · ');
}

function optionTags(item: ReturnEmailItem): string[] {
  return item.optionLabels.map((opt) => opt.value).filter((value) => value.trim().length > 0);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

/** `14 Nov` in Cairo time, or null. */
function shortDate(ms: number | null): string | null {
  if (ms === null) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Africa/Cairo',
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** `13 Nov · 14:32` in Cairo time, or null. */
function cairoDateTime(ms: number | null): string | null {
  const day = shortDate(ms);
  if (!day || ms === null) return null;
  try {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Africa/Cairo',
    }).format(new Date(ms));
    return `${day} · ${time}`;
  } catch {
    return day;
  }
}

function joinWith(parts: readonly (string | null | undefined)[], separator: string): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(separator);
}

function joinLines(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join('\n');
}

function joinText(parts: readonly (string | null | undefined)[]): string {
  return `${parts.filter((part): part is string => Boolean(part)).join('\n\n')}\n`;
}
