import { displayDecimals } from '../offers/engine/currency.js';
import {
  hasBankTransferDetails,
  hasInstapayDetails,
  orderStage,
  paymentDue,
  shopperWhatsappText,
  type BankTransferInfo,
  type InstapayInfo,
  type OrderMessageInput,
  type PayIn,
  type PaymentDue,
} from '../store/order-messages.js';
import { formatIban, whatsappChatUrl } from '../store/store-info.js';
import {
  amountBlock,
  bankBox,
  detailsBox,
  emailDocument,
  escapeHtml,
  FONT,
  footer,
  fullWidthLink,
  header,
  infoBoxes,
  INK,
  itemGrid,
  mainButton,
  paragraphHtml,
  photoStrip,
  section,
  sectionTitle,
  siteLabel,
  steps,
  TEXT_MUTED,
  textLink,
  totals,
  type AmountCell,
  type EmailButton,
  type EmailStep,
  type InfoBox,
  type ItemCard,
} from './email-blocks.js';
import type { OrderEmailKind } from './order-email-events.js';
import { orderConfirmationUrl, type OrderEmailLine, type OrderEmailOrder } from './order-email-model.js';

export { escapeHtml, type EmailButton } from './email-blocks.js';

/**
 * Order email copy. Agreed wording lives on the "Order emails with Resend" Linear issue (ATS-10);
 * keep both in step. Amounts are whole Egyptian pounds from the saved order.
 *
 * Cash on delivery (Egypt only): the shopper pays the shipping fee first by InstaPay, then the
 * rest (total − shipping) in cash on delivery. Free shipping means no deposit.
 * InstaPay (Egypt only): the shopper transfers the full total. Card or wallet (Paymob) is paid
 * in full online. Bank Transfer (abroad only): the shopper sends the total in their own currency
 * (`pricing.payIn`) to our IBAN and sends the receipt on WhatsApp. InstaPay and bank details and "send the screenshot" come only from `paymentDue()`
 * (functions/src/store/order-messages.ts), so a paid order never asks for money.
 *
 * Shopper emails use the "Bold Black" building blocks in `email-blocks.ts` (<KEY>-221). The store
 * alert keeps its older look (the helpers at the end of this file) until <KEY>-222.
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
  /** Our bank account for Bank Transfer (`STORE_INFO.payments.bankTransfer`); empty IBAN = not set. */
  readonly bankTransfer: BankTransferInfo;
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

/** `$205`, `€180`: the same format as the storefront `formatMoney()` for other currencies. */
export function formatPayIn(payIn: PayIn): string {
  const digits = displayDecimals(payIn.currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: payIn.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(payIn.amount);
  } catch {
    return `${payIn.amount} ${payIn.currency}`;
  }
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
      return paidConfirmed(order, ctx);
    case 'bank-transfer-placed':
      return bankTransferPlaced(order, ctx);
    case 'bank-transfer-confirmed':
      return paidConfirmed(order, ctx);
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

// ── Shopper emails ("Bold Black", <KEY>-221) ───────────────────────────────────

/** Said on every email of a large order whose delivery fee isn't set yet. */
const FEE_TO_AGREE =
  "It's a large order, so we'll message you on WhatsApp to agree the delivery fee before we send it.";

/** One part of a shopper email: its HTML row(s) and the same facts as plain text. */
interface Block {
  readonly html: string;
  readonly text: string | null;
}

interface ShopperEmail {
  readonly subject: string;
  /** Small line above the status, e.g. "Cash on Delivery" (shown in capitals). */
  readonly kicker: string;
  /** The huge status, one entry per line, e.g. `['Order', 'Placed']`. */
  readonly status: readonly string[];
  readonly sentence: string;
  /** 0 Placed … 3 Delivered, for the progress bar in the header; omit for none. */
  readonly progress?: number;
  readonly blocks: readonly (Block | null)[];
  /** Footer line while WhatsApp is set; default "Questions? We answer on WhatsApp." */
  readonly footerLine?: string;
  /** False leaves the footer's WhatsApp button out (the email already has one). */
  readonly footerButton?: boolean;
}

function renderShopper(order: OrderEmailOrder, ctx: OrderEmailContext, email: ShopperEmail): RenderedEmail {
  const blocks = email.blocks.filter((block): block is Block => block !== null);
  const help = footerHelp(ctx, email.footerLine, email.footerButton ?? true);
  const site = siteLabel(ctx.storefrontUrl);
  const html = emailDocument(email.subject, [
    header({
      storeName: ctx.storeName,
      ref: order.ref,
      kicker: email.kicker,
      status: email.status,
      sentence: email.sentence,
      progress: email.progress ?? null,
    }),
    ...blocks.map((block) => block.html),
    SPACER,
    footer({
      storeName: ctx.storeName,
      line: help.line,
      button: help.button,
      site,
      siteUrl: ctx.storefrontUrl,
    }),
  ]);
  const text = joinText([
    `${email.status.join(' ')}\n${email.kicker} · Order ${order.ref}`,
    email.sentence,
    ...blocks.map((block) => block.text),
    help.text,
  ]);
  return { subject: email.subject, html, text };
}

/** White space between the last section and the black footer. */
const SPACER = '<tr><td style="height:40px;font-size:0;line-height:0;">&nbsp;</td></tr>';

/**
 * WhatsApp is the client's main channel, so it wins over "reply to this email". Without a number
 * the footer has no WhatsApp line or button.
 */
function footerHelp(
  ctx: OrderEmailContext,
  line: string | undefined,
  withButton: boolean,
): { line: string | null; button: EmailButton | null; text: string | null } {
  const waNumber = ctx.whatsappNumber.trim();
  const waLink = whatsappChatUrl(waNumber);
  if (waLink) {
    const said = line ?? 'Questions? We answer on WhatsApp.';
    return {
      line: said,
      button: withButton ? { label: 'Message Us on WhatsApp', url: waLink } : null,
      text: withButton ? `${said}\nMessage Us on WhatsApp: ${waNumber} (${waLink})` : said,
    };
  }
  const reply = ctx.canReply ? 'Questions? Just reply to this email.' : null;
  const said = line && !/whatsapp/i.test(line) ? line : reply;
  return { line: said, button: null, text: said };
}

function codPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  if (order.feeToBeAgreed) return largeOrderPlaced(order, ctx);
  const cash = formatEgp(cashOnDeliveryEgp(order));
  const due = dueFor(order);
  if (due?.reason === 'shipping-fee') {
    const fee = due.amountEgp !== null ? formatEgp(due.amountEgp) : null;
    const pay = instapaySteps(order, ctx, due, 'fee');
    return renderShopper(order, ctx, {
      subject: `We got your order ${order.ref}`,
      kicker: 'Cash on Delivery',
      status: ['Order', 'Placed'],
      sentence: `Thanks, ${firstName(order)}. Pay the shipping fee by InstaPay and we'll send your order. You pay the rest in cash at your door.`,
      blocks: [
        amountRow([
          { label: 'Pay now', amount: fee ?? 'Shipping fee', note: 'Shipping fee by InstaPay' },
          { label: 'At your door', amount: cash, note: 'In cash when it arrives' },
        ]),
        stepsRow([
          placeStep(order),
          ...pay.steps,
          {
            state: 'next',
            title: 'Pay the rest in cash at your door',
            amount: cash,
            note: 'We send your order once the fee arrives.',
          },
        ]),
        pay.button ? buttonRow(pay.button) : null,
        ...orderSummary(order, ctx, { payment: ['Cash on Delivery', 'Fee first by InstaPay'] }),
      ],
    });
  }
  return renderShopper(order, ctx, {
    subject: `We got your order ${order.ref}`,
    kicker: 'Cash on Delivery',
    status: ['Order', 'Placed'],
    sentence: `Thanks, ${firstName(order)}. We've received your order ${order.ref}. We'll contact you to confirm it.`,
    blocks: [
      amountRow([
        {
          label: 'At your door',
          amount: cash,
          note: "In cash when it arrives. Shipping is free on this order, so there's nothing to pay now.",
        },
      ]),
      ...orderSummary(order, ctx, {
        payment: ['Cash on Delivery', 'Free shipping'],
        viewAsButton: true,
      }),
    ],
  });
}

/** Cash on Delivery or InstaPay order heavier than every box: nothing to pay until we agree the fee. */
function largeOrderPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const instapay = order.paymentMethod === 'instapay';
  const later: EmailStep[] = instapay
    ? [
        {
          state: 'next',
          title: 'Send the total by InstaPay',
          note: "We'll confirm your order as soon as we receive your payment.",
        },
      ]
    : [
        {
          state: 'next',
          title: 'Send the delivery fee by InstaPay',
          note: 'We send your order once it arrives.',
        },
        {
          state: 'next',
          title: 'Pay for your items in cash at your door',
          amount: formatEgp(order.subtotalEgp),
        },
      ];
  return renderShopper(order, ctx, {
    subject: `We got your order ${order.ref}`,
    kicker: 'Large order',
    status: ['Order', 'Placed'],
    sentence: `Thanks, ${firstName(order)}. ${FEE_TO_AGREE}`,
    blocks: [
      amountRow([
        {
          label: 'To pay now',
          amount: 'Nothing yet',
          note: "We'll email you the delivery fee once we agree it.",
        },
      ]),
      stepsRow([
        placeStep(order),
        {
          state: 'current',
          title: 'We message you about the delivery fee',
          note: 'On WhatsApp, usually the same day.',
        },
        ...later,
      ]),
      ...orderSummary(order, ctx, { payment: [methodName(order), 'Delivery fee to be agreed'] }),
    ],
  });
}

function instapayPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  if (order.feeToBeAgreed) return largeOrderPlaced(order, ctx);
  const due = dueFor(order);
  const pay = due ? instapaySteps(order, ctx, due, 'total') : null;
  return renderShopper(order, ctx, {
    subject: `We got your order ${order.ref}`,
    kicker: 'InstaPay',
    status: ['Order', 'Placed'],
    sentence: pay
      ? `Thanks, ${firstName(order)}. Send the total by InstaPay and we'll confirm your order as soon as it arrives.`
      : `Thanks, ${firstName(order)}. We've received your order ${order.ref}. We'll confirm it as soon as we receive your payment.`,
    blocks: [
      pay && due?.amountEgp != null
        ? amountRow([{ label: 'Send by InstaPay', amount: formatEgp(due.amountEgp) }])
        : null,
      pay ? stepsRow([placeStep(order), ...pay.steps]) : null,
      pay?.button ? buttonRow(pay.button) : null,
      ...orderSummary(order, ctx, {
        payment: ['InstaPay', 'Waiting for Payment'],
        viewAsButton: !pay?.button,
      }),
    ],
  });
}

function bankTransferPlaced(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const due = dueFor(order);
  const pay = due?.reason === 'bank-transfer' ? bankSteps(order, ctx, due) : null;
  return renderShopper(order, ctx, {
    subject: `We got your order ${order.ref}`,
    kicker: 'Bank Transfer',
    status: ['Order', 'Placed'],
    sentence: `Thanks, ${firstName(order)}. Send the total from your bank and we'll confirm your order as soon as the money arrives.`,
    blocks: [
      pay ? amountRow([sentAmount(order, 'Send from your bank', true)]) : null,
      pay ? stepsRow([placeStep(order), ...pay.steps]) : null,
      pay?.button ? buttonRow(pay.button) : null,
      ...orderSummary(order, ctx, {
        payment: ['Bank Transfer', 'Waiting for Payment'],
        youSend: order.payIn ? ['You send', formatPayIn(order.payIn)] : null,
        viewAsButton: !pay?.button,
      }),
    ],
  });
}

/**
 * A Bank Transfer amount in the shopper's currency, with the EGP total under it (the items and
 * totals are in Egyptian pounds, so the two amounts must not look like a mismatch).
 */
function sentAmount(order: OrderEmailOrder, label: string, pricesNote: boolean): AmountCell {
  if (!order.payIn || order.payIn.currency === 'EGP') {
    return { label, amount: formatEgp(order.totalEgp) };
  }
  return {
    label,
    amount: formatPayIn(order.payIn),
    note: `Same total as ${formatEgp(order.totalEgp)}.${pricesNote ? ' Item prices below are in EGP.' : ''}`,
  };
}

/**
 * Staff saved the delivery fee they agreed with the shopper on a large order (`changed` = a
 * later correction of that fee; the amounts to pay are the new ones).
 */
function deliveryFeeSet(order: OrderEmailOrder, ctx: OrderEmailContext, changed: boolean): RenderedEmail {
  const now = changed ? 'now ' : '';
  const fee = order.shippingEgp > 0 ? formatEgp(order.shippingEgp) : null;
  const cod = order.paymentMethod === 'cash-on-delivery';
  const cash = formatEgp(cashOnDeliveryEgp(order));
  const due = dueFor(order);
  const pay =
    due && due.reason !== 'bank-transfer' ? instapaySteps(order, ctx, due, cod ? 'fee' : 'total') : null;

  let sentence = fee
    ? `The delivery fee for your order ${order.ref} is ${now}${fee}.`
    : `Good news: delivery is ${now}free on your order ${order.ref}.`;
  if (pay) {
    sentence += cod
      ? " Send it by InstaPay and we'll send your order."
      : " Send the total by InstaPay and we'll confirm your order as soon as it arrives.";
  } else if (cod) {
    sentence += ` There's nothing to pay now. You'll pay ${cash} in cash when it arrives.`;
  }

  const agreed: EmailStep = {
    state: 'done',
    title: 'Agree the delivery fee',
    note: `Done. ${fee ?? 'Free'}`,
  };
  let cells: AmountCell[] = [];
  let list: EmailStep[] = [];
  if (cod) {
    cells =
      pay && fee
        ? [
            { label: 'Pay now', amount: fee, note: 'Delivery fee by InstaPay' },
            { label: 'At your door', amount: cash, note: 'In cash when it arrives' },
          ]
        : [{ label: 'At your door', amount: cash, note: 'In cash when it arrives' }];
    if (pay) {
      list = [
        { state: 'done', title: 'Place your order' },
        agreed,
        ...pay.steps,
        { state: 'next', title: 'Pay the rest in cash at your door', amount: cash },
      ];
    }
  } else if (pay && due?.amountEgp != null) {
    cells = [{ label: 'Send by InstaPay', amount: formatEgp(due.amountEgp) }];
    list = [{ state: 'done', title: 'Place your order' }, agreed, ...pay.steps];
  }

  return renderShopper(order, ctx, {
    subject: changed
      ? `Updated delivery fee for your order ${order.ref}`
      : `Delivery fee for your order ${order.ref}`,
    kicker: 'Delivery fee',
    status: changed ? ['Fee', 'Updated'] : ['Fee', 'Ready'],
    sentence,
    blocks: [
      cells.length ? amountRow(cells) : null,
      list.length ? stepsRow(list) : null,
      pay?.button ? buttonRow(pay.button) : null,
      changed
        ? noteRow("If you've already sent a different amount, message us on WhatsApp and we'll sort it out.")
        : null,
      ...orderSummary(order, ctx, { payment: null, delivery: false, viewAsButton: !pay?.button }),
    ],
  });
}

/** Paid in full and confirmed: InstaPay, Card (Paymob) or Bank Transfer share this email. */
function paidConfirmed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const bank = order.paymentMethod === 'bank-transfer';
  const name = methodName(order);
  const cell: AmountCell = bank
    ? sentAmount(order, `Paid by ${name}`, false)
    : { label: `Paid by ${name}`, amount: formatEgp(order.totalEgp) };
  const cardAbroad = order.paymentMethod === 'paymob' && order.isInternational;
  return renderShopper(order, ctx, {
    subject: `Payment received – order ${order.ref} is confirmed`,
    kicker: 'Payment received',
    status: ['Order', 'Confirmed'],
    sentence: `Thanks, ${firstName(order)}. We're getting your order ready and will email you when it's on its way.`,
    progress: 1,
    blocks: [
      amountRow([cell], true),
      cardAbroad
        ? noteRow(
            'You were charged in Egyptian pounds (EGP). Your bank converts it to your currency, so the amount on your statement may differ slightly.',
            TEXT_MUTED,
          )
        : null,
      ...orderSummary(order, ctx, {
        payment: [name, 'Paid'],
        totalLabel: 'Total paid',
        youSend: bank && order.payIn ? ['You sent', formatPayIn(order.payIn)] : null,
        viewAsButton: true,
      }),
    ],
  });
}

function codConfirmed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const feePaid = order.shippingEgp > 0;
  const cash = formatEgp(cashOnDeliveryEgp(order));
  const shipLabel = shippingLabel(order);
  return renderShopper(order, ctx, {
    subject: `Your order ${order.ref} is confirmed`,
    kicker: feePaid ? 'Shipping fee received' : 'Cash on Delivery',
    status: ['Order', 'Confirmed'],
    sentence: feePaid
      ? `Thanks, ${firstName(order)}. We've received your shipping fee and we're getting your order ready.`
      : `Good news: your order ${order.ref} is confirmed and we're getting it ready.`,
    progress: 1,
    blocks: [
      amountRow([
        {
          label: 'Have ready in cash',
          amount: cash,
          note: `Pay the courier when your order arrives.${feePaid ? ` Shipping fee ${formatEgp(order.shippingEgp)} already paid.` : ''}`,
        },
      ]),
      ...orderSummary(order, ctx, {
        payment: ['Cash on Delivery', feePaid ? 'Shipping fee paid' : 'Pay in cash at your door'],
        totalRows: [
          ['Subtotal', formatEgp(order.subtotalEgp)],
          feePaid ? [`${shipLabel} · paid`, formatEgp(order.shippingEgp)] : [shipLabel, 'Free'],
          ['Cash at your door', cash],
        ],
        viewAsButton: true,
      }),
    ],
  });
}

function orderShipped(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const cod = order.paymentMethod === 'cash-on-delivery';
  const date = shortDate(order.shippedAtMs);
  const view = orderButton(order, ctx);
  return renderShopper(order, ctx, {
    subject: `Your order ${order.ref} is on its way`,
    kicker: date ? `Shipped ${date}` : 'Shipped',
    status: ['On Its', 'Way'],
    sentence: `Good news, ${firstName(order)}: we've sent your order. Keep your phone close so the courier can reach you.`,
    progress: 2,
    blocks: [
      cod
        ? amountRow([
            {
              label: 'Have ready in cash',
              amount: formatEgp(cashOnDeliveryEgp(order)),
              note: 'Pay the courier when your order arrives.',
            },
          ])
        : null,
      boxesRow([{ label: 'On its way to', lines: addressLines(order) }], 32),
      itemsRow('In This Delivery', order.lines, ctx, { perRow: 3, prices: false }),
      view ? buttonRow(view, 8) : null,
    ],
  });
}

function orderDelivered(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const date = shortDate(order.deliveredAtMs);
  const waLink = whatsappChatUrl(ctx.whatsappNumber.trim());
  const cards = itemCards(order.lines, ctx, false, 400);
  const names = order.lines.map((line) => lineTitle(line));
  const help = waLink
    ? fullWidthLink({ label: 'Message Us on WhatsApp', url: waLink }, 'outlined')
    : ctx.canReply
      ? paragraphHtml('Just reply to this email.', TEXT_MUTED)
      : '';
  const helpText = waLink
    ? `Message Us on WhatsApp: ${waLink}`
    : ctx.canReply
      ? 'Just reply to this email.'
      : null;
  const notRight = "Wrong size or a problem with an item? Message us and we'll sort it out.";
  const view = orderButton(order, ctx);
  return renderShopper(order, ctx, {
    subject: `Your order ${order.ref} was delivered`,
    kicker: date ? `Delivered ${date}` : 'Delivered',
    status: ["It's", 'Here'],
    sentence: `Hi ${firstName(order)}, your order ${order.ref} was delivered. Thanks for shopping with us. We hope you enjoy it.`,
    progress: 3,
    footerLine: 'Thanks for shopping with us.',
    footerButton: false,
    blocks: [
      {
        html: photoStrip(cards, names.join(' · ')),
        text: `In this delivery:\n${itemsText(order.lines, false)}`,
      },
      {
        html: section(
          `${sectionTitle('Something Not Right?')}${paragraphHtml(notRight, TEXT_MUTED)}${help}`,
          36,
        ),
        text: joinParts(['Something Not Right?', notRight, helpText]),
      },
      ctx.storefrontUrl
        ? buttonRow({ label: 'Shop New Arrivals', url: `${ctx.storefrontUrl}/shop?newArrivals=1` }, 32)
        : null,
      view ? linkRow(view) : null,
    ],
  });
}

function paymentFailed(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const bought = order.lines.filter((line) => line.giftName === null);
  return renderShopper(order, ctx, {
    subject: `Your payment for order ${order.ref} didn't go through`,
    kicker: 'Card payment',
    status: ["Didn't Go", 'Through'],
    sentence: `Hi ${firstName(order)}, your card payment didn't go through. If you'd still like these items, please place the order again.`,
    footerLine: 'Trouble paying? We can help on WhatsApp.',
    blocks: [
      amountRow([
        {
          label: 'Charged',
          amount: formatEgp(0),
          note: "You haven't been charged. Nothing left your account.",
        },
      ]),
      ctx.storefrontUrl ? buttonRow({ label: 'Shop Again', url: `${ctx.storefrontUrl}/shop` }) : null,
      itemsRow('Still Want These?', bought.length ? bought : order.lines, ctx, { perRow: 2, prices: true }),
    ],
  });
}

// ── Shopper email parts ──────────────────────────────────────────────────────

/** Money still owed, from `paymentDue()` only, so a paid order never asks for money. */
function dueFor(order: OrderEmailOrder): PaymentDue | null {
  const input = messageInput(order);
  return paymentDue(orderStage(input), input);
}

/** The steps that ask for money, and the WhatsApp button that goes with them. */
interface PaySteps {
  readonly steps: readonly EmailStepWithText[];
  readonly button: EmailButton | null;
}

/** A step with the plain-text lines of its details box. */
interface EmailStepWithText extends EmailStep {
  readonly boxText?: readonly string[];
}

function placeStep(order: OrderEmailOrder): EmailStep {
  return { state: 'done', title: 'Place your order', note: `Done. Order ${order.ref}` };
}

/**
 * InstaPay step(s) for an order that owes money. `total`: send the total, then a separate step
 * for the screenshot. `fee`: send the shipping or delivery fee, with the screenshot in its note.
 * The WhatsApp button opens a chat with the shopper's message already written in Arabic.
 */
function instapaySteps(
  order: OrderEmailOrder,
  ctx: OrderEmailContext,
  due: PaymentDue,
  kind: 'total' | 'fee',
): PaySteps {
  const input = messageInput(order);
  const stage = orderStage(input);
  const amount = due.amountEgp !== null ? formatEgp(due.amountEgp) : null;
  const waUrl = whatsappChatUrl(ctx.whatsappNumber, shopperWhatsappText(stage, input, ctx.instapay));
  const title = kind === 'fee' ? 'Send the delivery fee by InstaPay' : 'Send the total by InstaPay';

  if (!hasInstapayDetails(ctx.instapay)) {
    return {
      steps: [
        {
          state: 'current',
          title,
          amount,
          note: waUrl
            ? "We'll send you the InstaPay details on WhatsApp."
            : "We'll send you the InstaPay details.",
        },
      ],
      button: waUrl ? { label: 'Message Us on WhatsApp', url: waUrl } : null,
    };
  }

  const address = ctx.instapay.address.trim();
  const number = ctx.instapay.number.trim();
  const rows: [string, string][] = [];
  if (address) rows.push(['Address', address]);
  if (number) rows.push(['Number', number]);
  const boxText = rows.map(([label, value]) => `InstaPay ${label.toLowerCase()}: ${value}`);
  const screenshot = waUrl
    ? 'Then send us the screenshot on WhatsApp.'
    : ctx.canReply
      ? 'Then reply to this email with a screenshot of the transfer.'
      : 'Then send us a screenshot of the transfer.';

  const pay: EmailStepWithText = {
    state: 'current',
    title,
    amount,
    note: kind === 'fee' ? screenshot : null,
    boxHtml: detailsBox(rows),
    boxText,
  };
  const steps: EmailStepWithText[] = [pay];
  if (kind === 'total') {
    steps.push({
      state: 'next',
      title: waUrl
        ? 'Send the screenshot on WhatsApp'
        : ctx.canReply
          ? 'Reply with the screenshot'
          : 'Send us the screenshot',
      note: 'We confirm your order and get it ready.',
    });
  }
  return {
    steps,
    button: waUrl ? { label: 'Send Screenshot on WhatsApp', url: waUrl } : null,
  };
}

/** Bank Transfer: our bank details, the reference, the fee line and Send Receipt on WhatsApp. */
function bankSteps(order: OrderEmailOrder, ctx: OrderEmailContext, due: PaymentDue): PaySteps {
  const input = messageInput(order);
  const stage = orderStage(input);
  const bank = ctx.bankTransfer;
  const waUrl = whatsappChatUrl(ctx.whatsappNumber, shopperWhatsappText(stage, input, ctx.instapay, bank));
  const payIn = due.payIn ?? null;
  const title = `Send ${payIn ? formatPayIn(payIn) : 'the total'} from your bank`;

  if (!hasBankTransferDetails(bank)) {
    return {
      steps: [
        {
          state: 'current',
          title,
          note: waUrl ? "We'll send you our bank details on WhatsApp." : "We'll send you our bank details.",
        },
      ],
      button: waUrl ? { label: 'Message Us on WhatsApp', url: waUrl } : null,
    };
  }

  const rows: { label: string; value: string; mono: boolean }[] = [];
  if (bank.accountName.trim())
    rows.push({ label: 'Account name', value: bank.accountName.trim(), mono: false });
  rows.push({ label: 'IBAN', value: formatIban(bank.iban), mono: true });
  if (bank.swift.trim()) rows.push({ label: 'SWIFT / BIC', value: bank.swift.trim(), mono: true });
  if (bank.bankName.trim()) rows.push({ label: 'Bank', value: bank.bankName.trim(), mono: false });
  const reference = order.ref.replace(/^#/, '');
  const fees = 'Choose "I pay all fees" in your bank app so the full amount reaches us.';

  return {
    steps: [
      {
        state: 'current',
        title,
        boxHtml: bankBox(rows, reference),
        boxText: [...rows.map((row) => `${row.label}: ${row.value}`), `Reference: ${reference}`],
        after: fees,
      },
      {
        state: 'next',
        title: waUrl
          ? 'Send the receipt on WhatsApp'
          : ctx.canReply
            ? 'Reply with the receipt'
            : 'Send us the receipt',
        note: 'We confirm and ship once the money arrives.',
      },
    ],
    button: waUrl ? { label: 'Send Receipt on WhatsApp', url: waUrl } : null,
  };
}

function amountRow(cells: readonly AmountCell[], check = false): Block {
  return {
    html: amountBlock(cells, check),
    text: cells
      .map((cell) => joinParts([`${upperFirst(cell.label)}: ${cell.amount}`, cell.note ?? null]))
      .join('\n'),
  };
}

function stepsRow(list: readonly EmailStepWithText[]): Block {
  const text = list
    .map((step, index) =>
      joinParts([
        `${index + 1}. ${step.title}${step.amount ? `: ${step.amount}` : ''}${step.state === 'done' ? ' ✓' : ''}`,
        step.note ? `   ${step.note}` : null,
        ...(step.boxText ?? []).map((line) => `   ${line}`),
        step.after ? `   ${step.after}` : null,
      ]),
    )
    .join('\n');
  return { html: steps(list), text };
}

function buttonRow(button: EmailButton, padTop = 28): Block {
  return { html: mainButton(button, padTop), text: `${button.label}: ${button.url}` };
}

function linkRow(button: EmailButton): Block {
  return {
    html: section(textLink({ label: `${button.label} →`, url: button.url }), 28),
    text: `${button.label}: ${button.url}`,
  };
}

function noteRow(textValue: string, color: string = INK): Block {
  return { html: section(paragraphHtml(textValue, color, 14), 24), text: textValue };
}

function boxesRow(boxes: readonly InfoBox[], padTop = 24): Block {
  return {
    html: section(infoBoxes(boxes), padTop),
    text: boxes.map((box) => `${upperFirst(box.label)}:\n${box.lines.join('\n')}`).join('\n\n'),
  };
}

function itemsRow(
  title: string,
  lines: readonly OrderEmailLine[],
  ctx: OrderEmailContext,
  opts: { perRow: 2 | 3; prices: boolean },
): Block {
  const width = opts.perRow === 2 ? 520 : 360;
  const grid = itemGrid(itemCards(lines, ctx, opts.prices, width), opts.perRow, opts.perRow === 2 ? 4 : 6);
  return {
    html: section(`${sectionTitle(title)}${grid}`, 40),
    text: `${title}:\n${itemsText(lines, opts.prices)}`,
  };
}

interface SummaryOptions {
  /** Payment box lines (method, state); null leaves the Payment box out. */
  readonly payment: readonly [string, string] | null;
  /** False leaves the Delivery To box out. */
  readonly delivery?: boolean;
  readonly totalLabel?: string;
  readonly totalRows?: readonly (readonly [string, string])[];
  /** Bold row under the total ("You send" / "You sent"). */
  readonly youSend?: readonly [string, string] | null;
  /** True: "View Your Order" is the black main button; false: a text link. */
  readonly viewAsButton?: boolean;
}

/** Your Items, totals, Delivery To / Payment and the order link: the end of most order emails. */
function orderSummary(order: OrderEmailOrder, ctx: OrderEmailContext, opts: SummaryOptions): Block[] {
  const rows = opts.totalRows ?? totalsFor(order, opts.totalLabel ?? 'Total');
  const after = opts.youSend ? [opts.youSend] : [];
  const boxes: InfoBox[] = [];
  if (opts.delivery !== false) boxes.push({ label: 'Delivery to', lines: addressLines(order) });
  if (opts.payment) boxes.push({ label: 'Payment', lines: opts.payment });
  const view = orderButton(order, ctx);
  const out: Block[] = [
    itemsRow('Your Items', order.lines, ctx, { perRow: 2, prices: true }),
    {
      html: section(totals(rows, after), 8),
      text: [...rows, ...after].map(([label, value]) => `${label}: ${value}`).join('\n'),
    },
  ];
  if (boxes.length) out.push(boxesRow(boxes));
  if (view) out.push(opts.viewAsButton ? buttonRow(view) : linkRow(view));
  return out;
}

function totalsFor(order: OrderEmailOrder, totalLabel: string): [string, string][] {
  const shipLabel = shippingLabel(order);
  if (order.feeToBeAgreed) {
    return [
      ['Subtotal', formatEgp(order.subtotalEgp)],
      [shipLabel, 'To be agreed'],
      [totalLabel, `${formatEgp(order.subtotalEgp)} + delivery`],
    ];
  }
  return [
    ['Subtotal', formatEgp(order.subtotalEgp)],
    [shipLabel, order.shippingEgp > 0 ? formatEgp(order.shippingEgp) : 'Free'],
    [totalLabel, formatEgp(order.totalEgp)],
  ];
}

/** "Delivery" for a large order whose fee is agreed with us, "Shipping" for the rest. */
function shippingLabel(order: OrderEmailOrder): string {
  return order.feeToBeAgreed || order.deliveryFeeAgreed ? 'Delivery' : 'Shipping';
}

function methodName(order: OrderEmailOrder): string {
  switch (order.paymentMethod) {
    case 'cash-on-delivery':
      return 'Cash on Delivery';
    case 'instapay':
      return 'InstaPay';
    case 'bank-transfer':
      return 'Bank Transfer';
    default:
      return 'Card';
  }
}

function itemCards(
  lines: readonly OrderEmailLine[],
  ctx: OrderEmailContext,
  prices: boolean,
  photoWidth: number,
): ItemCard[] {
  return lines.map((line) => {
    const gift = line.giftName !== null;
    return {
      name: lineTitle(line),
      details: lineDetails(line),
      price: prices ? (gift ? 'Free' : formatEgp(line.lineEgp)) : null,
      imageSrc: imageUrl(line.imagePath, ctx, photoWidth),
      tags: gift ? ['Free gift'] : line.dealTag ? [line.dealTag] : [],
    };
  });
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

function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function joinParts(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join('\n');
}

// ── Store-owner alert ────────────────────────────────────────────────────────

function storeNewOrder(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const method = order.paymentMethod;
  const label =
    method === 'cash-on-delivery'
      ? 'Cash on Delivery'
      : method === 'instapay'
        ? 'InstaPay – Waiting for Transfer'
        : method === 'bank-transfer'
          ? 'Bank Transfer – Waiting for Transfer'
          : 'Paid Online';
  const amount = order.feeToBeAgreed
    ? `${formatEgp(order.subtotalEgp)} + Delivery`
    : method === 'bank-transfer' && order.payIn
      ? `${formatPayIn(order.payIn)} (${formatEgp(order.totalEgp)})`
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
    case 'bank-transfer':
      return {
        method: 'Bank Transfer',
        rows: [
          ['Customer Sends', order.payIn ? formatPayIn(order.payIn) : 'The Total'],
          ['Order Total in EGP', total],
        ],
        note: "Confirm the order in the dashboard once the money is in the account and the receipt shows the full amount in the customer's currency. Prices abroad include the international markup, so more pounds than the order total usually arrive.",
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
    payIn: order.payIn,
  };
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

/** ImageKit link for an item photo, at most `width` × 1.25 `width` px (twice the shown size). */
export function imageUrl(path: string | null, ctx: OrderEmailContext, width = 192): string | null {
  if (!path) return null;
  if (path.startsWith('https://')) return path;
  if (!ctx.imageBaseUrl) return null;
  const clean = path
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${ctx.imageBaseUrl}/${clean}?tr=w-${width},h-${Math.round(width * 1.25)},c-at_max`;
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

function itemsText(lines: readonly OrderEmailLine[], prices = true): string {
  return lines
    .map((line) => {
      if (!prices) return `- ${lineTitle(line)} (${lineDetails(line)})`;
      return line.giftName !== null
        ? `  + ${line.giftName}: ${lineTitle(line)} (${lineDetails(line)}): Free`
        : `- ${lineTitle(line)} (${lineDetails(line)}): ${formatEgp(line.lineEgp)}${line.dealTag ? ` (${line.dealTag})` : ''}`;
    })
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

// ── Store alert HTML (today's look until <KEY>-222 moves it to the new blocks) ──

const MUTED = '#555555';
const LINE = '#e5e5e5';
const TONAL = '#e8e8e8';

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

function h1(textValue: string): string {
  return `<h1 style="margin:0 0 16px;${FONT}font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(textValue)}</h1>`;
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
function buttonHtml(button: EmailButton, variant: 'filled' | 'tonal' = 'filled'): string {
  const colors =
    variant === 'tonal' ? `background:${TONAL};color:${INK};` : `background:${INK};color:#ffffff;`;
  return `<p style="margin:24px 0 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 20px;${colors}text-decoration:none;font-weight:600;border-radius:2px;">${escapeHtml(button.label)}</a></p>`;
}
