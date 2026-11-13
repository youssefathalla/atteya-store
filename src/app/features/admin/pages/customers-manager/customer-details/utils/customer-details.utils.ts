import { shopperWhatsappNumber } from '@core/config/order-messages';
import { whatsappChatUrl } from '@core/config/store-info';
import type { Customer, CustomerNote } from '@core/services/customers';
import { shortOrderRef } from '@core/services/orders/order-ref';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { orderDate } from '@core/services/orders/shopper-orders.service';
import { normalizeImageKitPath } from '@shared/utils/image';
import { ORDER_STATUS_CONFIG } from '../../../orders-manager/models/order-status-config';
import { formatOrderTotal, paymentLabel } from '../../../orders-manager/utils/order-admin.utils';
import { countryName } from '../../../orders-manager/utils/order-details.utils';

/** The customer page lists this many orders at a time (ATS-278). */
export const CUSTOMER_ORDERS_PAGE_SIZE = 20;

/** Most delivery addresses the Delivery Addresses card shows. */
export const MAX_CUSTOMER_ADDRESSES = 5;

/** Firestore `in` takes at most 30 values. */
const MAX_EMAIL_VALUES = 30;

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const NOTE_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "12 Sep 2026". */
export function longDate(date: Date): string {
  return LONG_DATE.format(date);
}

/** "9 Nov" this year, "9 Nov 2025" for an earlier year. */
export function shortDate(date: Date, now: Date): string {
  return date.getFullYear() === now.getFullYear() ? SHORT_DATE.format(date) : LONG_DATE.format(date);
}

/** The order emails to look up: the lower-cased email first, then other saved spellings of it. */
export function orderEmailValues(customer: Pick<Customer, 'email' | 'emailVariants'>): string[] {
  const email = customer.email.trim().toLowerCase();
  const values = new Set([email]);
  for (const variant of customer.emailVariants) {
    if (variant && variant.trim().toLowerCase() === email) values.add(variant);
  }
  return [...values].slice(0, MAX_EMAIL_VALUES);
}

/** "email · phone · city" under the name. */
export function contactLine(customer: Customer): string {
  return [customer.email, customer.phone, customer.city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
}

/** "Customer since 12 Sep 2026 · Email confirmed · Gets offer emails" (the last two for accounts only). */
export function sinceLine(customer: Customer, since: Date | null): string {
  const parts: string[] = [];
  if (since) parts.push(`Customer since ${longDate(since)}`);
  if (customer.hasAccount && customer.emailVerified) parts.push('Email confirmed');
  if (customer.hasAccount && customer.marketingOptIn) parts.push('Gets offer emails');
  return parts.join(' · ');
}

/** The WhatsApp chat with the customer; null when the phone can't be turned into a WhatsApp number. */
export function customerWhatsappUrl(customer: Customer): string | null {
  const number = shopperWhatsappNumber(customer.phone, customer.country || 'EG');
  return number ? whatsappChatUrl(number) : null;
}

/**
 * Confirmed, Shipped and Delivered orders. The summary keeps the money and the average per
 * completed order, so the count is the spend divided by that average (capped by what is left
 * after the open orders).
 */
export function completedOrderCount(customer: Customer): number {
  if (customer.averageOrderEgp <= 0 || customer.spentEgp <= 0) return 0;
  const most = Math.max(0, customer.orderCount - customer.openOrderCount);
  return Math.min(most, Math.round(customer.spentEgp / customer.averageOrderEgp));
}

/** "3 completed · 1 open · 1 cancelled" under the Orders number; "No orders yet" when none. */
export function orderMixLine(customer: Customer): string {
  if (customer.orderCount === 0) return 'No orders yet';
  const completed = completedOrderCount(customer);
  const open = customer.openOrderCount;
  // Orders leave out Payment Failed, so what is left after completed and open is cancelled.
  const cancelled = Math.max(0, customer.orderCount - completed - open);
  return `${completed} completed · ${open} open · ${cancelled} cancelled`;
}

/** One order in the customer's Orders card. */
export interface CustomerOrderRow {
  readonly id: string;
  readonly ref: string;
  readonly date: string;
  /** Up to 3 item photos (ImageKit paths). */
  readonly photos: readonly { readonly src: string; readonly path: string; readonly alt: string }[];
  /** "3 items · InstaPay". */
  readonly summary: string;
  readonly status: OrderDoc['status'];
  /** The status name the Orders page shows ("Waiting for Payment"). */
  readonly statusName: string;
  readonly statusTone: StatusTone;
  readonly total: string;
}

/** Status pill look: Shipped, Delivered (and Confirmed) black, Waiting for Payment outlined, the rest light grey. */
export type StatusTone = 'solid' | 'outlined' | 'muted';

export function statusTone(status: OrderDoc['status']): StatusTone {
  switch (status) {
    case 'confirmed':
    case 'shipped':
    case 'delivered':
      return 'solid';
    case 'pending':
      return 'outlined';
    default:
      return 'muted';
  }
}

export function customerOrderRow(order: OrderDoc, now: Date): CustomerOrderRow {
  const items = order.pricing.lines.filter((line) => !line.gift);
  const pieces = items.reduce((sum, line) => sum + line.quantity, 0);
  const photos = items
    .map((line) => ({ path: line.imagePath?.trim() ?? '', alt: line.name ?? '' }))
    .filter((photo) => photo.path !== '')
    .slice(0, 3)
    .map((photo) => ({ ...photo, src: normalizeImageKitPath(photo.path) }));
  const placed = orderDate(order.createdAt);
  return {
    id: order.id,
    ref: shortOrderRef(order.id),
    date: placed ? shortDate(placed, now) : '',
    photos,
    summary: `${pieces} ${pieces === 1 ? 'item' : 'items'} · ${paymentLabel(order)}`,
    status: order.status,
    statusName: ORDER_STATUS_CONFIG[order.status]?.label ?? order.status,
    statusTone: statusTone(order.status),
    total: formatOrderTotal(order),
  };
}

/** The address fields an order and the account both keep. */
export interface AddressFields {
  readonly fullName: string;
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly country: string;
}

/** One distinct delivery address in the Delivery Addresses card. */
export interface CustomerAddress {
  readonly key: string;
  readonly lines: readonly string[];
  /** "Saved on the account · used 4 times", "Used once · order #A1B2C3". */
  readonly label: string;
}

const squash = (value: string | null | undefined): string => (value ?? '').trim().replace(/\s+/g, ' ');

/** Case, spaces and punctuation ignored: "1 Test Street, Nasr City" = "1 test street nasr city". */
const keyPart = (value: string | null | undefined): string =>
  squash(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();

/** Same street, city and country = same address (case, spaces and punctuation ignored). */
export function addressKey(address: AddressFields): string {
  return [address.line1, address.line2, address.city, address.region, address.postalCode, address.country]
    .map(keyPart)
    .join('|');
}

export function addressLines(address: AddressFields): string[] {
  const place = [address.city, address.region, address.postalCode].map(squash).filter(Boolean).join(', ');
  const country = squash(address.country).toUpperCase();
  return [
    squash(address.fullName),
    squash(address.line1),
    squash(address.line2),
    place,
    country && country !== 'EG' ? countryName(country) : country === 'EG' ? 'Egypt' : '',
  ].filter(Boolean);
}

function usageText(count: number, onlyRef: string | null): string | null {
  if (count === 0) return null;
  if (count === 1) return onlyRef ? `used once · order ${onlyRef}` : 'used once';
  return `used ${count} times`;
}

/**
 * Each distinct shipping address from the orders (newest use first), plus the address saved on
 * the account even when no order used it (it comes first). At most `MAX_CUSTOMER_ADDRESSES`.
 */
export function customerAddresses(
  orders: readonly OrderDoc[],
  saved: AddressFields | null,
): CustomerAddress[] {
  const groups = new Map<string, { address: AddressFields; count: number; ref: string; newest: number }>();
  for (const order of orders) {
    const key = addressKey(order.shipping);
    const placed = orderDate(order.createdAt)?.getTime() ?? 0;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (placed > group.newest) {
        group.newest = placed;
        group.address = order.shipping;
      }
    } else {
      groups.set(key, { address: order.shipping, count: 1, ref: shortOrderRef(order.id), newest: placed });
    }
  }

  const savedKey = saved ? addressKey(saved) : null;
  const result: CustomerAddress[] = [];
  if (saved && savedKey !== null) {
    const used = groups.get(savedKey);
    const usage = usageText(used?.count ?? 0, used?.ref ?? null);
    result.push({
      key: savedKey,
      lines: addressLines(saved),
      label: usage ? `Saved on the account · ${usage}` : 'Saved on the account',
    });
  }
  const others = [...groups.entries()]
    .filter(([key]) => key !== savedKey)
    .sort(([, left], [, right]) => right.newest - left.newest);
  for (const [key, group] of others) {
    const usage = usageText(group.count, group.ref) ?? '';
    result.push({
      key,
      lines: addressLines(group.address),
      label: usage.charAt(0).toUpperCase() + usage.slice(1),
    });
  }
  return result.slice(0, MAX_CUSTOMER_ADDRESSES);
}

/** "Last changed by sara@atteyastore.com, 10 Nov, 14:07"; null when the note was never saved. */
export function noteChangedLine(note: CustomerNote | null): string | null {
  if (!note) return null;
  const when = orderDate(note.updatedAt);
  const who = note.updatedByEmail.trim() || 'staff';
  return when ? `Last changed by ${who}, ${NOTE_DATE.format(when)}` : `Last changed by ${who}`;
}
