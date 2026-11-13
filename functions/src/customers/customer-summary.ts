import { createHash } from 'node:crypto';
import { orderSearchTokens } from '../store/order-search.js';

/**
 * `customers/{customerId}` (ATS-276): one summary per email address, for everyone who placed an
 * order (signed in or as a guest) or made an account. Written only by the customer triggers in
 * `customer-summary.trigger.ts` and `functions/scripts/fill-customers.mjs`, always rebuilt from all
 * of that email's orders, never added to or subtracted from, so retries and out-of-order events are
 * safe. Pure rules here; tested in `customer-summary.test.ts`.
 */
export const CUSTOMERS_COLLECTION = 'customers';

/** Most orders one rebuild reads for an email. */
export const MAX_CUSTOMER_ORDERS = 500;

/** Most order numbers saved in `searchTokens` (newest first). */
export const MAX_CUSTOMER_ORDER_REFS = 50;

/**
 * Firestore `in` takes at most 30 values: the lower-cased email plus the spellings orders saved it
 * with (`Mariam@Gmail.com`).
 */
export const MAX_EMAIL_VARIANTS = 30;

/** The only order fields the summary reads (the trigger and the fill script select these). */
export const CUSTOMER_ORDER_FIELDS = [
  'status',
  'customerEmail',
  'createdAt',
  'pricing.totalEgp',
  'shipping.fullName',
  'shipping.phone',
  'shipping.city',
  'shipping.country',
] as const;

/** Statuses whose `totalEgp` counts toward `spentEgp`. */
const COMPLETED_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'shipped', 'delivered']);

/** Trimmed, lower-cased email (the same rule as `emailSignups`). */
export function normalizeCustomerEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A trimmed, lower-cased email with one `@` and something on both sides, else null. */
export function customerEmailOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = normalizeCustomerEmail(value);
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@') || at === email.length - 1) return null;
  return email;
}

/** `customers/{id}`: SHA-256 of the trimmed, lower-cased email, so the address never shows in a link. */
export function customerIdFromEmail(email: string): string {
  return createHash('sha256').update(normalizeCustomerEmail(email)).digest('hex');
}

/** The fields of one order the summary needs. */
export interface CustomerOrderInput {
  readonly id: string;
  readonly status: string;
  readonly totalEgp: number;
  readonly createdAtMs: number | null;
  readonly fullName: string;
  readonly phone: string;
  readonly city: string;
  readonly country: string;
}

/** The account behind the email (Auth user plus its `users/{uid}` doc). */
export interface CustomerAccountInput {
  readonly uid: string;
  readonly name: string;
  readonly phone: string;
  readonly city: string;
  readonly country: string;
  readonly marketingOptIn: boolean;
  readonly emailVerified: boolean;
  readonly createdAtMs: number | null;
}

/** What `customers/{id}` holds, with dates as epoch ms (the trigger turns them into Timestamps). */
export interface CustomerSummary {
  readonly email: string;
  readonly name: string;
  readonly phone: string;
  readonly city: string;
  readonly country: string;
  readonly uid: string | null;
  readonly hasAccount: boolean;
  readonly marketingOptIn: boolean;
  readonly emailVerified: boolean;
  readonly orderCount: number;
  readonly openOrderCount: number;
  readonly cancelledOrderCount: number;
  readonly spentEgp: number;
  readonly averageOrderEgp: number;
  readonly firstOrderAtMs: number | null;
  readonly lastOrderAtMs: number | null;
  readonly createdAtMs: number | null;
  readonly searchTokens: string[];
  /** Other spellings of the email that orders were saved with, so the next rebuild finds them. */
  readonly emailVariants: string[];
}

/** Payment Failed orders don't count as orders (a failed card attempt only). */
export function orderCounts(status: string): boolean {
  return status !== 'failed';
}

/** Confirmed, Shipped and Delivered orders count toward money spent. */
export function orderIsCompleted(status: string): boolean {
  return COMPLETED_STATUSES.has(status);
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** One order doc as the summary reads it. */
export function customerOrderFrom(
  id: string,
  data: Record<string, unknown>,
  createdAtMs: number | null,
): CustomerOrderInput {
  const shipping = (data['shipping'] ?? {}) as Record<string, unknown>;
  const pricing = (data['pricing'] ?? {}) as Record<string, unknown>;
  const total = pricing['totalEgp'];
  return {
    id,
    status: text(data['status']),
    totalEgp: typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : 0,
    createdAtMs,
    fullName: text(shipping['fullName']),
    phone: text(shipping['phone']),
    city: text(shipping['city']),
    country: text(shipping['country']).toUpperCase(),
  };
}

const minMs = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : Math.min(...known);
};

const maxMs = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : Math.max(...known);
};

/** Newest first (then by id, so the result never depends on read order); no date goes last. */
function newestFirst(orders: readonly CustomerOrderInput[]): CustomerOrderInput[] {
  return [...orders].sort(
    (left, right) =>
      (right.createdAtMs ?? -1) - (left.createdAtMs ?? -1) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
}

/**
 * Every word staff may type to find this customer: the name (Arabic or English) and its starts, the
 * phone (local, +20, its starts and last digits), the email and its name part (the same words
 * `orderSearchTokens()` saves on orders), then the short number of each order, newest first
 * (`a1b2c3` from `#A1B2C3`, at most 50).
 */
export function customerSearchTokens(
  name: string,
  phone: string,
  email: string,
  orderIdsNewestFirst: readonly string[],
): string[] {
  const tokens = new Set(orderSearchTokens({ orderId: '', fullName: name, phone, email }));
  for (const id of orderIdsNewestFirst.slice(0, MAX_CUSTOMER_ORDER_REFS)) {
    const ref = id.slice(0, 6).toLowerCase();
    if (ref.length > 0) tokens.add(ref);
  }
  return [...tokens];
}

/**
 * The whole summary for one email from all of its orders and its account (null for a guest).
 * Returns null when nothing is left to show (no orders and no account), so the doc is deleted.
 * `rawEmails` are the spellings orders saved the email with.
 */
export function buildCustomerSummary(
  email: string,
  orders: readonly CustomerOrderInput[],
  account: CustomerAccountInput | null,
  rawEmails: readonly string[] = [],
): CustomerSummary | null {
  const normalized = normalizeCustomerEmail(email);
  if (orders.length === 0 && !account) return null;

  const sorted = newestFirst(orders);
  const counted = sorted.filter((order) => orderCounts(order.status));
  const completed = sorted.filter((order) => orderIsCompleted(order.status));
  const spentEgp = completed.reduce((sum, order) => sum + order.totalEgp, 0);

  // Contact details: the newest order that has a name, else the account's saved details.
  const latest = sorted.find((order) => order.fullName.length > 0) ?? null;
  const name = latest?.fullName || account?.name || '';
  const phone = latest?.phone || account?.phone || '';
  const city = latest ? latest.city : account?.city || '';
  const country = latest ? latest.country : account?.country || '';

  const emailVariants = [...new Set(rawEmails.filter((raw) => raw !== normalized))].slice(
    0,
    MAX_EMAIL_VARIANTS - 1,
  );

  return {
    email: normalized,
    name,
    phone,
    city,
    country,
    uid: account?.uid ?? null,
    hasAccount: account !== null,
    marketingOptIn: account?.marketingOptIn ?? false,
    emailVerified: account?.emailVerified ?? false,
    orderCount: counted.length,
    openOrderCount: sorted.filter((order) => order.status === 'pending').length,
    cancelledOrderCount: sorted.filter((order) => order.status === 'cancelled' || order.status === 'failed')
      .length,
    spentEgp,
    averageOrderEgp: completed.length === 0 ? 0 : Math.round(spentEgp / completed.length),
    firstOrderAtMs: minMs(counted.map((order) => order.createdAtMs)),
    lastOrderAtMs: maxMs(counted.map((order) => order.createdAtMs)),
    createdAtMs: minMs([...sorted.map((order) => order.createdAtMs), account?.createdAtMs ?? null]),
    searchTokens: customerSearchTokens(
      name,
      phone,
      normalized,
      sorted.map((order) => order.id),
    ),
    emailVariants,
  };
}

/** The emails to look up orders by: the lower-cased one first, then other saved spellings (≤ 30). */
export function emailLookupValues(email: string, variants: readonly unknown[]): string[] {
  const normalized = normalizeCustomerEmail(email);
  const values = new Set([normalized]);
  for (const variant of variants) {
    if (typeof variant !== 'string' || variant.length === 0) continue;
    if (normalizeCustomerEmail(variant) !== normalized) continue;
    values.add(variant);
  }
  return [...values].slice(0, MAX_EMAIL_VARIANTS);
}

/** The account as the summary reads it, from the `users/{uid}` doc and the Auth user. */
export function customerAccountFrom(
  uid: string,
  data: Record<string, unknown>,
  emailVerified: boolean,
  createdAtMs: number | null,
): CustomerAccountInput {
  const address = (data['address'] ?? {}) as Record<string, unknown>;
  return {
    uid,
    name: text(data['name']) || text(address['fullName']),
    phone: text(data['phone']) || text(address['phone']),
    city: text(address['city']),
    country: text(address['country']).toUpperCase(),
    marketingOptIn: data['marketingOptIn'] === true,
    emailVerified,
    createdAtMs,
  };
}

const fieldAt = (data: Record<string, unknown> | undefined, path: string): unknown => {
  let value: unknown = data;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
};

/** Comparable form of a field value (Firestore Timestamps compare by their epoch ms). */
const comparable = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return `ts:${(value as { toMillis: () => number }).toMillis()}`;
  }
  return JSON.stringify(value ?? null);
};

/**
 * True when an order write can change its customer: a create or delete, or a change to one of
 * `CUSTOMER_ORDER_FIELDS`. Writes that touch only other fields (`searchTokens`, `claimedAt`,
 * `updatedAt`, Paymob details) are skipped.
 */
export function orderFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!before || !after) return before !== after;
  return CUSTOMER_ORDER_FIELDS.some(
    (path) => comparable(fieldAt(before, path)) !== comparable(fieldAt(after, path)),
  );
}

/** True when a `users/{uid}` update changed something the customer shows. */
export function accountFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  for (const key of ['name', 'phone', 'address', 'marketingOptIn']) {
    if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)) return true;
  }
  return false;
}
