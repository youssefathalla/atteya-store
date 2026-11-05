// GENERATED — edit functions/src/store
/**
 * What an order may show or say, decided in ONE place for the website, the order emails and
 * the admin. Pure: no Firebase, no Angular.
 *
 * Edit ONLY this file (functions/src/store/order-messages.ts), then run `npm run sync:engine`,
 * which copies it to src/app/core/config/order-messages.ts.
 *
 * The rule that matters: InstaPay details and "send the screenshot" appear only while money is
 * actually owed (`paymentDue()` is not null). A paid, failed, cancelled or abroad order never
 * asks for money. Amounts come only from the saved order, never from live prices.
 *
 * WhatsApp messages are Arabic with English digits (`1,500 EGP`, `#A1B2C3`) so amounts and
 * order numbers read the same for everyone. The person still taps send in WhatsApp.
 */
import { STORE_INFO, type StoreInfo } from './store-info';

/** The fields of a saved order that decide its stage. */
export interface OrderMessageInput {
  /** `#A1B2C3` (`shortOrderRef()`). */
  readonly ref: string;
  /** `paymob` | `cash-on-delivery` | `instapay` (anything else = legacy). */
  readonly paymentMethod: string;
  /** `pending` | `confirmed` | `failed` | `cancelled`. */
  readonly status: string;
  /** Shipping country (ISO alpha-2). */
  readonly country: string;
  /** Saved shipping fee in whole EGP, or null when unknown. */
  readonly shippingEgp: number | null;
  /** Saved order total in whole EGP, or null when unknown. */
  readonly totalEgp: number | null;
  /** Paid, but an item ran short when the payment cleared. */
  readonly needsReview: boolean;
}

export type OrderStage =
  /** InstaPay order waiting for the full transfer. */
  | 'instapay-total-due'
  /** Cash on delivery waiting for the shipping fee (above 0) by InstaPay. */
  | 'instapay-fee-due'
  /** Cash on delivery with free shipping, not confirmed yet. Nothing to pay now. */
  | 'cod-free-pending'
  /** Cash on delivery confirmed; the rest is paid in cash on delivery. */
  | 'cod-confirmed'
  /** Paid in full (InstaPay or card/wallet) and confirmed. */
  | 'paid'
  /** Paid in full, but an item ran short. Staff explain; no ready-made "getting it ready". */
  | 'paid-needs-review'
  /** Card/wallet payment still being confirmed by Paymob. */
  | 'paymob-pending'
  | 'failed'
  | 'cancelled'
  /** Legacy or unreadable order: show nothing payment-specific. */
  | 'unknown';

export type InstapayInfo = StoreInfo['payments']['instapay'];

export interface PaymentDue {
  /** What the shopper transfers by InstaPay, in whole EGP. Null when the saved amount is unreadable. */
  readonly amountEgp: number | null;
  readonly reason: 'total' | 'shipping-fee';
}

export function orderStage(order: OrderMessageInput): OrderStage {
  const { paymentMethod, status } = order;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  const confirmed = status === 'confirmed';
  const pending = status === 'pending';
  const paidStage: OrderStage = order.needsReview ? 'paid-needs-review' : 'paid';

  if (paymentMethod === 'instapay') {
    // InstaPay is Egypt-only; anything else is not ours to explain.
    if (order.country !== 'EG') return 'unknown';
    if (pending) return 'instapay-total-due';
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

/** Money the shopper still owes by InstaPay. Null for every stage that must not ask for money. */
export function paymentDue(stage: OrderStage, order: OrderMessageInput): PaymentDue | null {
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
): string | null {
  if (stage === 'paymob-pending' || stage === 'unknown') return null;

  const first = shopperName.trim().split(/\s+/)[0] ?? '';
  const greeting = `أهلاً${first ? ` ${first}` : ''}، معاك ${storeName} بخصوص طلبك رقم ${order.ref}.`;
  const cash = cashOnDeliveryEgp(order);
  const cashText = cash !== null ? formatEgpPlain(cash) : 'باقي المبلغ';
  const where = instapayWhere(info);

  switch (stage) {
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
      const head = fee !== null && fee > 0 ? 'استلمنا مصاريف الشحن، وطلبك اتأكد وبنجهزه.' : 'طلبك اتأكد وبنجهزه.';
      return `${greeting}\n${head} جهّز ${cashText} كاش عند الاستلام.`;
    }
    case 'paid':
      return `${greeting}\nاستلمنا دفع طلبك بالكامل، وطلبك اتأكد وبنجهزه للشحن.`;
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
