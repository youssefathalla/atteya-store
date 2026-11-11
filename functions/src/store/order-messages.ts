/**
 * What an order may show or say, decided in ONE place for the website, the order emails and
 * the admin. Pure: no Firebase, no Angular.
 *
 * Edit ONLY this file (functions/src/store/order-messages.ts), then run `npm run sync:engine`,
 * which copies it to src/app/core/config/order-messages.ts.
 *
 * The rule that matters: InstaPay or bank details and "send the screenshot / receipt" appear only
 * while money is actually owed (`paymentDue()` is not null). A paid, failed, cancelled or abroad order never
 * asks for money. Amounts come only from the saved order, never from live prices.
 *
 * WhatsApp messages are Arabic with English digits (`1,500 EGP`, `#A1B2C3`) so amounts and
 * order numbers read the same for everyone. The person still taps send in WhatsApp.
 */
import { STORE_INFO, type StoreInfo } from './store-info.js';

/** The fields of a saved order that decide its stage. */
export interface OrderMessageInput {
  /** `#A1B2C3` (`shortOrderRef()`). */
  readonly ref: string;
  /** `paymob` | `cash-on-delivery` | `instapay` | `bank-transfer` (anything else = legacy). */
  readonly paymentMethod: string;
  /** `pending` | `confirmed` | `shipped` | `delivered` | `failed` | `cancelled`. */
  readonly status: string;
  /** Shipping country (ISO alpha-2). */
  readonly country: string;
  /** Saved shipping fee in whole EGP, or null when unknown. */
  readonly shippingEgp: number | null;
  /** Saved order total in whole EGP, or null when unknown. */
  readonly totalEgp: number | null;
  /** Paid, but an item ran short when the payment cleared. */
  readonly needsReview: boolean;
  /**
   * Egypt order heavier than the biggest box whose delivery fee staff haven't set yet
   * (`pricing.shipping.kind === 'domestic-agreed'` and `feeAgreed !== true`). Missing = false.
   * While true, `shippingEgp` and `totalEgp` should be null: neither amount is known.
   */
  readonly feeToBeAgreed?: boolean;
  /**
   * Bank Transfer only: the saved amount to send in the shopper's currency (`pricing.payIn`).
   * Missing or null = unknown.
   */
  readonly payIn?: PayIn | null;
}

/** An amount in the shopper's own currency, e.g. `{ currency: 'USD', amount: 205 }`. */
export interface PayIn {
  readonly currency: string;
  readonly amount: number;
}

export type OrderStage =
  /** InstaPay or cash on delivery, large order: staff agree the delivery fee on WhatsApp first. */
  | 'fee-to-be-agreed'
  /** InstaPay order waiting for the full transfer. */
  | 'instapay-total-due'
  /** Cash on delivery waiting for the shipping fee (above 0) by InstaPay. */
  | 'instapay-fee-due'
  /** Bank Transfer (outside Egypt) waiting for the total in the shopper's currency. */
  | 'bank-transfer-due'
  /** Cash on delivery with free shipping, not confirmed yet. Nothing to pay now. */
  | 'cod-free-pending'
  /** Cash on delivery confirmed; the rest is paid in cash on delivery. */
  | 'cod-confirmed'
  /** Paid in full (InstaPay, Bank Transfer or card/wallet) and confirmed. */
  | 'paid'
  /** Paid in full, but an item ran short. Staff explain; no ready-made "getting it ready". */
  | 'paid-needs-review'
  /** Card/wallet payment still being confirmed by Paymob. */
  | 'paymob-pending'
  /** Staff sent the order (any payment method). Cash on Delivery still pays the rest at the door. */
  | 'shipped'
  /** The order reached the shopper. */
  | 'delivered'
  | 'failed'
  | 'cancelled'
  /** Legacy or unreadable order: show nothing payment-specific. */
  | 'unknown';

export type InstapayInfo = StoreInfo['payments']['instapay'];

export type BankTransferInfo = StoreInfo['payments']['bankTransfer'];

export interface PaymentDue {
  /**
   * What the shopper owes, in whole EGP. Null when the saved amount is unreadable. For Bank
   * Transfer this is what we expect to receive; the shopper sends `payIn` instead.
   */
  readonly amountEgp: number | null;
  /** `total` / `shipping-fee`: by InstaPay. `bank-transfer`: the total from their bank, in `payIn`. */
  readonly reason: 'total' | 'shipping-fee' | 'bank-transfer';
  /** Bank Transfer only: the amount to send in the shopper's currency, or null when unreadable. */
  readonly payIn?: PayIn | null;
}

/**
 * True for a saved `pricing.shipping` line whose delivery fee staff haven't set yet: an Egypt
 * order heavier than the biggest box (`kind: 'domestic-agreed'`, `feeAgreed` not true).
 */
export function isDeliveryFeeToBeAgreed(shipping: unknown): boolean {
  if (!shipping || typeof shipping !== 'object') return false;
  const line = shipping as Record<string, unknown>;
  return line['kind'] === 'domestic-agreed' && line['feeAgreed'] !== true;
}

export function orderStage(order: OrderMessageInput): OrderStage {
  const { paymentMethod, status } = order;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  const known =
    paymentMethod === 'instapay' ||
    paymentMethod === 'cash-on-delivery' ||
    paymentMethod === 'paymob' ||
    paymentMethod === 'bank-transfer';
  if (status === 'shipped') return known ? 'shipped' : 'unknown';
  if (status === 'delivered') return known ? 'delivered' : 'unknown';
  const confirmed = status === 'confirmed';
  const pending = status === 'pending';
  const paidStage: OrderStage = order.needsReview ? 'paid-needs-review' : 'paid';
  const manual = paymentMethod === 'instapay' || paymentMethod === 'cash-on-delivery';

  // Nothing can be paid until the delivery fee is agreed, so no InstaPay box yet.
  if (manual && pending && order.country === 'EG' && order.feeToBeAgreed === true) {
    return 'fee-to-be-agreed';
  }

  if (paymentMethod === 'instapay') {
    // InstaPay is Egypt-only; anything else is not ours to explain.
    if (order.country !== 'EG') return 'unknown';
    if (pending) return 'instapay-total-due';
    if (confirmed) return paidStage;
    return 'unknown';
  }

  if (paymentMethod === 'bank-transfer') {
    // Bank Transfer is for orders shipped outside Egypt only.
    if (order.country === 'EG') return 'unknown';
    if (pending) return 'bank-transfer-due';
    if (confirmed) return paidStage;
    return 'unknown';
  }

  if (paymentMethod === 'cash-on-delivery') {
    if (order.country !== 'EG') return 'unknown';
    if (confirmed) return 'cod-confirmed';
    if (!pending) return 'unknown';
    const fee = wholeEgp(order.shippingEgp);
    if (fee === null) return 'unknown';
    return fee > 0 ? 'instapay-fee-due' : 'cod-free-pending';
  }

  if (paymentMethod === 'paymob') {
    if (pending) return 'paymob-pending';
    if (confirmed) return paidStage;
    return 'unknown';
  }

  return 'unknown';
}

/**
 * Money the shopper still owes (by InstaPay, or by Bank Transfer from abroad). Null for every stage
 * that must not ask for money.
 */
export function paymentDue(stage: OrderStage, order: OrderMessageInput): PaymentDue | null {
  if (stage === 'bank-transfer-due') {
    return { amountEgp: positiveEgp(order.totalEgp), reason: 'bank-transfer', payIn: readPayIn(order.payIn) };
  }
  if (stage === 'instapay-total-due') {
    return { amountEgp: positiveEgp(order.totalEgp), reason: 'total' };
  }
  if (stage === 'instapay-fee-due') {
    return { amountEgp: positiveEgp(order.shippingEgp), reason: 'shipping-fee' };
  }
  return null;
}

/** Cash paid on delivery (total − shipping), or null when either saved amount is unreadable. */
export function cashOnDeliveryEgp(order: OrderMessageInput): number | null {
  const total = wholeEgp(order.totalEgp);
  const fee = wholeEgp(order.shippingEgp);
  if (total === null || fee === null) return null;
  return Math.max(0, total - fee);
}

export function hasInstapayDetails(info: InstapayInfo = STORE_INFO.payments.instapay): boolean {
  return info.address.trim() !== '' || info.number.trim() !== '';
}

export function hasBankTransferDetails(info: BankTransferInfo = STORE_INFO.payments.bankTransfer): boolean {
  return info.iban.replace(/\s/g, '') !== '';
}

/** `205 USD`, `12.345 KWD` (English digits). For WhatsApp messages. */
export function formatPayInPlain(payIn: PayIn): string {
  return `${payIn.amount.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${payIn.currency}`;
}

/** A saved `pricing.payIn` that can be shown, or null (missing, not a positive amount, bad code). */
export function readPayIn(value: unknown): PayIn | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const currency = raw['currency'];
  const amount = raw['amount'];
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || currency === 'EGP') return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  return { currency, amount };
}

/** `1,500 EGP` (English digits, no decimals). */
export function formatEgpPlain(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} EGP`;
}

/**
 * Message the SHOPPER sends to the store (prefilled in WhatsApp). Null = no WhatsApp button
 * (a card payment is still being confirmed).
 */
export function shopperWhatsappText(
  stage: OrderStage,
  order: OrderMessageInput,
  info: InstapayInfo = STORE_INFO.payments.instapay,
): string | null {
  const ref = order.ref;
  const due = paymentDue(stage, order);
  if (due?.reason === 'bank-transfer') {
    const amount = due.payIn ? `${formatPayInPlain(due.payIn)} ` : '';
    return `مرحباً، طلبي رقم ${ref}. حوّلت ${amount}من البنك، ودي صورة إيصال التحويل.`;
  }
  if (due) {
    const amount = due.amountEgp !== null ? ` ${formatEgpPlain(due.amountEgp)}` : '';
    const what = due.reason === 'shipping-fee' ? `مصاريف الشحن${amount}` : amount ? amount.trim() : 'المبلغ';
    if (!hasInstapayDetails(info)) {
      return `مرحباً، طلبي رقم ${ref}. محتاج بيانات InstaPay علشان أحوّل ${what}.`;
    }
    return `مرحباً، طلبي رقم ${ref}. حوّلت ${what} على InstaPay، ودي صورة التحويل.`;
  }
  switch (stage) {
    case 'paymob-pending':
      return null;
    case 'fee-to-be-agreed':
      return `مرحباً، طلبي رقم ${ref}. عايز أعرف مصاريف الشحن.`;
    case 'failed':
      return `مرحباً، الدفع لطلبي رقم ${ref} ما اكتملش. ممكن تساعدوني؟`;
    default:
      return `مرحباً، عندي سؤال عن طلبي رقم ${ref}.`;
  }
}

/**
 * Message STAFF send to the shopper from the admin (prefilled in WhatsApp; staff can edit it).
 * Null = no WhatsApp button for this stage.
 */
export function staffWhatsappText(
  stage: OrderStage,
  order: OrderMessageInput,
  shopperName: string,
  info: InstapayInfo = STORE_INFO.payments.instapay,
  storeName: string = STORE_INFO.name,
  bank: BankTransferInfo = STORE_INFO.payments.bankTransfer,
): string | null {
  if (stage === 'paymob-pending' || stage === 'unknown') return null;

  const first = shopperName.trim().split(/\s+/)[0] ?? '';
  const greeting = `أهلاً${first ? ` ${first}` : ''}، معاك ${storeName} بخصوص طلبك رقم ${order.ref}.`;
  const cash = cashOnDeliveryEgp(order);
  const cashText = cash !== null ? formatEgpPlain(cash) : 'باقي المبلغ';
  const where = instapayWhere(info);

  switch (stage) {
    case 'fee-to-be-agreed':
      // Staff add the fee they quote, then save it in the dashboard (Set delivery fee).
      return `${greeting}\nطلبك وصلنا، ولأنه طلب كبير هنتفق معاك على مصاريف الشحن قبل ما نشحنه.`;
    case 'bank-transfer-due': {
      const payIn = readPayIn(order.payIn);
      const amount = payIn ? formatPayInPlain(payIn) : 'إجمالي الطلب';
      const where = bankWhere(bank);
      return where
        ? `${greeting}\nعلشان نأكد الطلب ونشحنه، محتاجين تحوّل ${amount} من البنك على حسابنا:\n${where}\nاكتب ${order.ref.replace(/^#/, '')} في ملاحظة التحويل، وابعتلنا إيصال التحويل هنا.`
        : `${greeting}\nعلشان نأكد الطلب ونشحنه، محتاجين تحوّل ${amount} من البنك. هنبعتلك بيانات الحساب هنا.`;
    }
    case 'instapay-total-due': {
      const total = positiveEgp(order.totalEgp);
      const amount = total !== null ? formatEgpPlain(total) : 'إجمالي الطلب';
      return where
        ? `${greeting}\nعلشان نأكد الطلب ونشحنه، محتاجين تحوّل ${amount} ${where}.\nابعتلنا صورة التحويل هنا.`
        : `${greeting}\nعلشان نأكد الطلب ونشحنه، محتاجين تحوّل ${amount} على InstaPay. هنبعتلك بيانات InstaPay هنا.`;
    }
    case 'instapay-fee-due': {
      const fee = positiveEgp(order.shippingEgp);
      const feeText = fee !== null ? ` ${formatEgpPlain(fee)}` : '';
      const rest = cash !== null ? `، والباقي ${cashText} هتدفعه كاش عند الاستلام` : '';
      return where
        ? `${greeting}\nعلشان نشحن الطلب، محتاجين مصاريف الشحن${feeText} ${where}.\nابعتلنا صورة التحويل هنا${rest}.`
        : `${greeting}\nعلشان نشحن الطلب، محتاجين مصاريف الشحن${feeText} على InstaPay. هنبعتلك بيانات InstaPay هنا${rest}.`;
    }
    case 'cod-free-pending':
      return `${greeting}\nطلبك وصلنا والشحن مجاني، فمفيش حاجة مطلوبة دلوقتي. هتدفع ${cashText} كاش عند الاستلام.`;
    case 'cod-confirmed': {
      const fee = wholeEgp(order.shippingEgp);
      const head =
        fee !== null && fee > 0 ? 'استلمنا مصاريف الشحن، وطلبك اتأكد وبنجهزه.' : 'طلبك اتأكد وبنجهزه.';
      return `${greeting}\n${head} جهّز ${cashText} كاش عند الاستلام.`;
    }
    case 'paid':
      return `${greeting}\nاستلمنا دفع طلبك بالكامل، وطلبك اتأكد وبنجهزه للشحن.`;
    case 'shipped':
      return order.paymentMethod === 'cash-on-delivery'
        ? `${greeting}\nطلبك اتشحن وفي الطريق ليك. جهّز ${cashText} كاش عند الاستلام.`
        : `${greeting}\nطلبك اتشحن وفي الطريق ليك.`;
    case 'delivered':
      return `${greeting}\nطلبك وصلك. شكراً إنك اشتريت مننا!`;
    case 'paid-needs-review':
    case 'failed':
    case 'cancelled':
      return greeting;
  }
}

/**
 * Phone number from checkout → international digits for `wa.me`, or null when it can't be done
 * safely (then the admin copies the number instead of opening a chat with a stranger).
 * Egypt: must be a mobile (010/011/012/015). Abroad without `+`/`00`: only a leading trunk `0`
 * is replaced by the country's dialling code; anything else is ambiguous.
 */
export function shopperWhatsappNumber(phone: string, country: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let intl: string | null;
  if (trimmed.startsWith('+')) {
    intl = digits;
  } else if (digits.startsWith('00')) {
    intl = digits.slice(2);
  } else if (country === 'EG') {
    if (digits.startsWith('20') && digits.length === 12) intl = digits;
    else if (digits.startsWith('0')) intl = `20${digits.slice(1)}`;
    else if (digits.length === 10 && digits.startsWith('1')) intl = `20${digits}`;
    else intl = null;
  } else {
    const code = DIALLING_CODES[country];
    intl = code && digits.startsWith('0') && !digits.startsWith('00') ? `${code}${digits.slice(1)}` : null;
  }

  if (!intl) return null;
  if (intl.startsWith('20')) return EGYPT_MOBILE.test(intl) ? intl : null;
  return intl.length >= 8 && intl.length <= 15 ? intl : null;
}

/** True when a phone typed at checkout is an Egyptian mobile WhatsApp can reach. */
export function isEgyptMobile(phone: string): boolean {
  const intl = shopperWhatsappNumber(phone, 'EG');
  return intl !== null && intl.startsWith('20');
}

/** `+20 …` international mobile: 20 + 1[0125] + 8 digits. */
const EGYPT_MOBILE = /^201[0125]\d{8}$/;

/** Dialling codes for the checkout countries (`checkout-countries.ts`). */
const DIALLING_CODES: Readonly<Record<string, string>> = {
  EG: '20',
  AE: '971',
  AU: '61',
  BH: '973',
  CA: '1',
  DE: '49',
  ES: '34',
  FR: '33',
  GB: '44',
  IT: '39',
  JO: '962',
  KW: '965',
  NL: '31',
  OM: '968',
  QA: '974',
  SA: '966',
  US: '1',
};

/** Account name, IBAN, SWIFT and bank, one per line, or null when no IBAN is set. */
function bankWhere(bank: BankTransferInfo): string | null {
  if (!hasBankTransferDetails(bank)) return null;
  return [
    bank.accountName.trim() ? `Account name: ${bank.accountName.trim()}` : '',
    `IBAN: ${bank.iban.replace(/\s/g, '')}`,
    bank.swift.trim() ? `SWIFT / BIC: ${bank.swift.trim()}` : '',
    bank.bankName.trim() ? `Bank: ${bank.bankName.trim()}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** `على InstaPay: name@instapay أو رقم 010…`, or null when no details are set. */
function instapayWhere(info: InstapayInfo): string | null {
  const address = info.address.trim();
  const number = info.number.trim();
  if (address && number) return `على InstaPay: ${address} أو رقم ${number}`;
  if (address) return `على InstaPay: ${address}`;
  if (number) return `على InstaPay رقم ${number}`;
  return null;
}

function wholeEgp(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function positiveEgp(value: number | null): number | null {
  const amount = wholeEgp(value);
  return amount !== null && amount > 0 ? amount : null;
}
