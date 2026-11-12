import { displayDecimals } from '../offers/engine/currency.js';
import {
  hasBankTransferDetails,
  hasInstapayDetails,
  orderStage,
  paymentDue,
  shopperWhatsappNumber,
  shopperWhatsappText,
  staffWhatsappText,
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
  type ItemGift,
  mainButton,
  nextStepBox,
  outlinedButton,
  paragraphHtml,
  photoStrip,
  section,
  sectionTitle,
  siteLabel,
  staffHeader,
  statStrip,
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
 * Shopper emails use the "Bold Black" building blocks in `email-blocks.ts` (<KEY>-221), and so does
 * the staff new-order alert (<KEY>-222).
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
  /** True when this block already holds a Message Us on WhatsApp button (the footer then skips its own). */
  readonly whatsappButton?: boolean;
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
  /** Footer line shown whether or not WhatsApp is set, with no footer button (Delivered). */
  readonly footerNote?: string;
}

function renderShopper(order: OrderEmailOrder, ctx: OrderEmailContext, email: ShopperEmail): RenderedEmail {
  const blocks = email.blocks.filter((block): block is Block => block !== null);
  const hasWhatsappButton = blocks.some((block) => block.whatsappButton === true);
  const help = footerHelp(ctx, email, !hasWhatsappButton);
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
  email: ShopperEmail,
  withButton: boolean,
): { line: string | null; button: EmailButton | null; text: string | null } {
  if (email.footerNote) return { line: email.footerNote, button: null, text: email.footerNote };
  const waNumber = ctx.whatsappNumber.trim();
  const waLink = whatsappChatUrl(waNumber);
  if (waLink) {
    const said = email.footerLine ?? 'Questions? We answer on WhatsApp.';
    return {
      line: said,
      button: withButton ? { label: 'Message Us on WhatsApp', url: waLink } : null,
      text: withButton ? `${said}\nMessage Us on WhatsApp: ${waNumber} (${waLink})` : said,
    };
  }
  const reply = ctx.canReply ? 'Questions? Just reply to this email.' : null;
  return { line: reply, button: null, text: reply };
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
      // Free shipping: nothing to pay now. A fee that `paymentDue()` can't read never says "free".
      order.shippingEgp > 0
        ? amountRow([{ label: 'At your door', amount: cash, note: 'In cash when it arrives' }])
        : amountRow([
            {
              label: 'At your door',
              amount: cash,
              note: "In cash when it arrives. Shipping is free on this order, so there's nothing to pay now.",
            },
          ]),
      ...orderSummary(order, ctx, {
        payment: ['Cash on Delivery', order.shippingEgp > 0 ? 'Fee first by InstaPay' : 'Free shipping'],
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
          note: "We'll message you on WhatsApp with the delivery fee.",
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
      ...orderSummary(order, ctx, { payment: [methodName(order), 'Delivery fee coming soon'] }),
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
      itemsRow('In This Delivery', order.lines, ctx, { prices: false }),
      view ? buttonRow(view, 8) : null,
    ],
  });
}

function orderDelivered(order: OrderEmailOrder, ctx: OrderEmailContext): RenderedEmail {
  const date = shortDate(order.deliveredAtMs);
  const waLink = whatsappChatUrl(ctx.whatsappNumber.trim());
  const shown = order.lines.slice(0, 3);
  // Edge to edge across 600px: ask ImageKit for twice the shown width.
  const cards = itemCards(shown, ctx, false, Math.min(1200, Math.ceil(1200 / shown.length)));
  const more = order.lines.length - shown.length;
  const names = [...shown.map((line) => lineTitle(line)), ...(more > 0 ? [`+ ${more} more`] : [])];
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
    footerNote: 'Thanks for shopping with us.',
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
        whatsappButton: Boolean(waLink),
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
      itemsRow('Still Want These?', bought.length ? bought : order.lines, ctx, { prices: true }),
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
  // Large orders agree a "delivery fee" with us; every other order pays its "shipping fee".
  const feeName = order.deliveryFeeAgreed ? 'delivery fee' : 'shipping fee';
  const title = kind === 'fee' ? `Send the ${feeName} by InstaPay` : 'Send the total by InstaPay';

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
  return {
    html: mainButton(button, padTop),
    text: `${button.label}: ${button.url}`,
    whatsappButton: button.label === 'Message Us on WhatsApp',
  };
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
  opts: { prices: boolean },
): Block {
  const compactAfter = 4;
  const cards = itemCards(lines, ctx, opts.prices, 520);
  // Twice the shown width: big photos in the grid, 64px thumbnails in the compact list.
  const grid = itemGrid(
    cards.length > compactAfter ? itemCards(lines, ctx, opts.prices, 128) : cards,
    compactAfter,
  );
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
    itemsRow('Your Items', order.lines, ctx, { prices: true }),
    {
      html: section(totals(rows, after), 8),
      text: [...rows, ...after].map(([label, value]) => `${label}: ${value}`).join('\n'),
    },
  ];
  if (boxes.length) out.push(boxesRow(boxes));
  if (view) out.push(opts.viewAsButton ? buttonRow(view) : linkRow(view));
  return out;
}

/** Shopper emails say we'll message them; the staff alert says the fee is not set yet. */
function totalsFor(
  order: OrderEmailOrder,
  totalLabel: string,
  pendingFeeText = "We'll message you",
): [string, string][] {
  const shipLabel = shippingLabel(order);
  if (order.feeToBeAgreed) {
    return [
      ['Subtotal', formatEgp(order.subtotalEgp)],
      [shipLabel, pendingFeeText],
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
  return foldGifts(
    lines,
    (line) => ({
      name: lineTitle(line),
      details: lineDetails(line),
      price: prices ? formatEgp(line.lineEgp) : null,
      imageSrc: imageUrl(line.imagePath, ctx, photoWidth),
      tags: line.dealTag ? [line.dealTag] : [],
    }),
    (line) => ({ name: lineTitle(line), details: lineDetails(line) }),
  );
}

/**
 * One card per bought line; a free gift line (listed right after its item) becomes a strip under
 * that item. A gift with no item before it (should not happen) stays a card of its own.
 */
function foldGifts(
  lines: readonly OrderEmailLine[],
  buildCard: (line: OrderEmailLine) => Omit<ItemCard, 'gifts'>,
  buildGift: (line: OrderEmailLine) => ItemGift,
): ItemCard[] {
  const cards: { card: Omit<ItemCard, 'gifts'>; gifts: ItemGift[] }[] = [];
  for (const line of lines) {
    if (line.giftName !== null && cards.length > 0) {
      cards[cards.length - 1]!.gifts.push(buildGift(line));
      continue;
    }
    cards.push({ card: buildCard(line), gifts: [] });
  }
  return cards.map(({ card, gifts }) => (gifts.length ? { ...card, gifts } : card));
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

// ── Store-owner alert ("Bold Black", <KEY>-222) ───────────────────────────────

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
  const top = staffTop(order, payment);
  const strip: AmountCell[] = [{ label: 'Items', amount: String(pieceCount(order.lines)) }, ...payment.cells];
  // When the note is already the header sentence (a large order), the box only names the action.
  const step = payment.step;
  const stepNote = step && step.note !== top.sentence ? step.note : null;
  const customer = staffCustomer(order, ctx);
  const pack = packList(order.lines, ctx);
  const totalRows = totalsFor(order, 'Total', 'Not set yet');
  const button = ctx.storefrontUrl
    ? { label: 'Open This Order', url: `${ctx.storefrontUrl}/admin/orders/${encodeURIComponent(order.id)}` }
    : null;

  const html = emailDocument(subject, [
    staffHeader({
      storeName: ctx.storeName,
      kicker: top.kicker,
      amount: top.amount,
      amountNote: top.amountNote,
      refLine: `${order.ref} · ${methodName(order)}`,
      sentence: top.sentence,
    }),
    statStrip(strip),
    step ? section(nextStepBox(step.action, stepNote), 32) : '',
    customer.html,
    pack.html,
    section(totals(totalRows), 8),
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
    joinParts([
      top.kicker,
      top.amountNote ? `${top.amount} (${top.amountNote})` : top.amount,
      `${order.ref} · ${methodName(order)}`,
      top.sentence,
    ]),
    strip.map((cell) => `${upperFirst(cell.label)}: ${cell.amount}`).join('\n'),
    step ? joinParts([`Next Step: ${step.action}`, stepNote]) : null,
    customer.text,
    pack.text,
    totalRows.map(([rowLabel, value]) => `${rowLabel}: ${value}`).join('\n'),
    button ? `${button.label}: ${button.url}` : null,
    STAFF_FOOTER,
  ]);
  return { subject, html, text };
}

const STAFF_FOOTER = 'Sent to the store team for every new order.';

/** What staff collect for a new order: the amounts for the strip, the next action and today's note. */
interface StorePayment {
  readonly cells: readonly AmountCell[];
  /** The next-step box: the action in bold and today's note under it; null when there is no note. */
  readonly step: { readonly action: string; readonly note: string } | null;
}

function storePayment(order: OrderEmailOrder): StorePayment {
  const total = formatEgp(order.totalEgp);
  if (order.feeToBeAgreed) {
    return {
      cells: [
        { label: 'Items Total', amount: formatEgp(order.subtotalEgp) },
        { label: 'Delivery Fee', amount: 'Not Set Yet' },
      ],
      step: {
        action: 'Agree the delivery fee on WhatsApp',
        note: 'This order is heavier than the biggest box. Agree the delivery fee with the customer on WhatsApp, then set it in the dashboard.',
      },
    };
  }
  switch (order.paymentMethod) {
    case 'cash-on-delivery': {
      const cash = { label: 'Cash at Door', amount: formatEgp(cashOnDeliveryEgp(order)) };
      return order.shippingEgp > 0
        ? {
            cells: [{ label: 'Fee by InstaPay', amount: formatEgp(order.shippingEgp) }, cash],
            step: {
              action: `Wait for ${formatEgp(order.shippingEgp)} on InstaPay`,
              note: 'Send the order once the shipping fee arrives on InstaPay.',
            },
          }
        : {
            cells: [{ label: 'Fee by InstaPay', amount: 'Free' }, cash],
            step: null,
          };
    }
    case 'instapay':
      return {
        cells: [{ label: 'Waiting for Transfer', amount: total }],
        step: {
          action: `Wait for ${total} on InstaPay`,
          note: 'Confirm the payment in the dashboard once you see it in your bank app.',
        },
      };
    case 'bank-transfer': {
      const sends = order.payIn ? formatPayIn(order.payIn) : 'The Total';
      return {
        cells: [
          { label: 'Customer Sends', amount: sends },
          { label: 'Order Total in EGP', amount: total },
        ],
        step: {
          action: order.payIn ? `Wait for ${sends} by bank transfer` : 'Wait for the bank transfer',
          note: "Confirm the order in the dashboard once the money is in the account and the receipt shows the full amount in the customer's currency. Prices abroad include the international markup, so more pounds than the order total usually arrive.",
        },
      };
    }
    default:
      return { cells: [{ label: 'Paid', amount: total }], step: null };
  }
}

/** The header's kicker, big amount and warning: a warning replaces the date when the order needs a look. */
function staffTop(
  order: OrderEmailOrder,
  payment: StorePayment,
): { kicker: string; amount: string; amountNote: string | null; sentence: string | null } {
  const bank = order.paymentMethod === 'bank-transfer' && order.payIn !== null && !order.feeToBeAgreed;
  const amount = order.feeToBeAgreed
    ? `${formatEgp(order.subtotalEgp)} + Delivery`
    : bank
      ? formatPayIn(order.payIn!)
      : formatEgp(order.totalEgp);
  const amountNote = bank ? `${formatEgp(order.totalEgp)} order total` : null;
  if (order.needsReview) {
    return {
      kicker: 'Check This Order',
      amount,
      amountNote,
      sentence: 'One item sold out before this payment came in. Please check this order.',
    };
  }
  if (order.feeToBeAgreed) {
    return { kicker: 'Agree the Delivery Fee', amount, amountNote, sentence: payment.step?.note ?? null };
  }
  const when = cairoDateTime(order.createdAtMs);
  return { kicker: when ? `New Order · ${when}` : 'New Order', amount, amountNote, sentence: null };
}

/** `12 Nov · 14:32` in Cairo time, or null. */
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

function pieceCount(lines: readonly OrderEmailLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** "Box 1", "Box 2 (abroad)", or null when the order has no box. */
function boxName(order: OrderEmailOrder): string | null {
  if (!order.boxId) return null;
  const name = `Box ${order.boxId.replace(/\D/g, '') || order.boxId}`;
  return order.isInternational ? `${name} (abroad)` : name;
}

/** Customer block: name, phone link · email, grey address line and the WhatsApp button. */
function staffCustomer(order: OrderEmailOrder, ctx: OrderEmailContext): Block {
  const a = order.address;
  const where = [
    a.line1,
    a.line2,
    a.city,
    order.isInternational ? a.region : null,
    order.isInternational ? a.postalCode : null,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(', ');
  const country = order.isInternational ? countryName(a.country) : null;
  const greyLine = [
    joinWith([where, country], ', '),
    order.guestCheckout ? 'Guest checkout' : 'Account',
    boxName(order),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  const phone = a.phone.trim();
  const email = order.customerEmail?.trim() ?? '';
  const phoneHtml = phone
    ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}" style="color:${INK};font-weight:600;text-decoration:underline;">${escapeHtml(phone)}</a>`
    : '';
  const contactHtml = [phoneHtml, email ? escapeHtml(email) : ''].filter(Boolean).join(' · ');
  const waNumber = shopperWhatsappNumber(a.phone, a.country);
  let waText: string | null = null;
  if (waNumber) {
    const input = messageInput(order);
    waText = staffWhatsappText(
      orderStage(input),
      input,
      a.fullName,
      ctx.instapay,
      ctx.storeName,
      ctx.bankTransfer,
    );
  }
  const waUrl = waNumber ? whatsappChatUrl(waNumber, waText) : null;
  const wa = waUrl ? { label: 'Message Customer on WhatsApp', url: waUrl } : null;

  const html = section(
    `<p style="margin:0;${FONT}font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:${INK};word-break:break-word;">${escapeHtml(a.fullName || 'Customer')}</p>
${contactHtml ? `<p style="margin:10px 0 0;${FONT}font-size:15px;line-height:1.5;color:${INK};word-break:break-word;">${contactHtml}</p>` : ''}
${greyLine ? `<p style="margin:6px 0 0;${FONT}font-size:14px;line-height:1.5;color:${TEXT_MUTED};word-break:break-word;">${escapeHtml(greyLine)}</p>` : ''}
${wa ? `<div style="margin-top:18px;">${outlinedButton(wa)}</div>` : ''}`,
    36,
  );
  const text = joinParts([
    `Customer: ${a.fullName || 'Customer'}`,
    phone ? `Phone: ${phone}` : null,
    email ? `Email: ${email}` : null,
    greyLine || null,
    wa ? `${wa.label}: ${wa.url}` : null,
  ]);
  return { html, text };
}

/** Pack List: 2 photos per row with a ×2 tag on each, gifts under their item; 5 or more items use the compact list. */
function packList(lines: readonly OrderEmailLine[], ctx: OrderEmailContext): Block {
  const compactAfter = 4;
  const bought = lines.filter((line, index) => line.giftName === null || index === 0).length;
  const width = bought > compactAfter ? 128 : 520;
  const cards: ItemCard[] = foldGifts(
    lines,
    (line) => ({
      name: lineTitle(line),
      details: lineTags(line).join(' · '),
      price: formatEgp(line.lineEgp),
      imageSrc: imageUrl(line.imagePath, ctx, width),
      tags: [`×${line.quantity}`, ...(line.dealTag ? [line.dealTag] : [])],
    }),
    (line) => ({
      name: lineTitle(line),
      details: joinWith([line.giftName, `×${line.quantity}`, lineTags(line).join(' · ')], ' · '),
    }),
  );
  const text = lines
    .map((line) => {
      const gift = line.giftName !== null;
      const options = lineTags(line).join(' · ');
      const price = gift
        ? (line.giftName ?? 'Free gift')
        : `${formatEgp(line.lineEgp)}${line.dealTag ? ` (${line.dealTag})` : ''}`;
      return `- ×${line.quantity} ${lineTitle(line)}${options ? ` (${options})` : ''}: ${price}`;
    })
    .join('\n');
  return {
    html: section(`${sectionTitle('Pack List')}${itemGrid(cards, compactAfter)}`, 40),
    text: `Pack List:\n${text}`,
  };
}

function joinWith(parts: readonly (string | null | undefined)[], separator: string): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(separator);
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

function joinText(parts: readonly (string | null | undefined)[]): string {
  return `${parts.filter((part): part is string => Boolean(part)).join('\n\n')}\n`;
}

/** Short tags for a line's options: "Size M" for the size, the plain value for the rest. */
function lineTags(line: OrderEmailLine): string[] {
  return line.optionLabels
    .map((opt) => (opt.label.trim().toLowerCase() === 'size' ? `Size ${opt.value}` : opt.value))
    .filter((tag) => tag.trim().length > 0);
}
