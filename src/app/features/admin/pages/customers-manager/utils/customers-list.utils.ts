import { Timestamp } from 'firebase/firestore';
import type { Customer } from '@core/services/customers';
import { accountInitial } from '@core/services/user-profile/profile-display';
import { orderSearchTerms, orderSearchWords } from '@core/config/order-search';

/** The Customers list shows this many at a time (ATS-277). */
export const CUSTOMERS_PAGE_SIZE = 50;

/** The filter chips (phone: the Show select). One at a time. */
export type CustomerFilter = 'all' | 'repeat' | 'accounts' | 'guests' | 'account-no-order';

export const CUSTOMER_FILTERS: readonly { readonly id: CustomerFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'repeat', label: 'Ordered More Than Once' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'guests', label: 'Guests' },
  { id: 'account-no-order', label: 'Account, No Order Yet' },
];

/** The Sort by select. Every sort is newest / largest first. */
export type CustomerSort = 'last-order' | 'spent' | 'orders' | 'newest';

export const CUSTOMER_SORTS: readonly { readonly id: CustomerSort; readonly label: string }[] = [
  { id: 'last-order', label: 'Last Order, Newest First' },
  { id: 'spent', label: 'Most Spent' },
  { id: 'orders', label: 'Most Orders' },
  { id: 'newest', label: 'Newest Customers' },
];

/** The `customers` field each sort orders by. */
export const CUSTOMER_SORT_FIELD: Readonly<Record<CustomerSort, keyof Customer>> = {
  'last-order': 'lastOrderAt',
  spent: 'spentEgp',
  orders: 'orderCount',
  newest: 'createdAt',
};

/** Ordered more than once. */
export const REPEAT_ORDER_COUNT = 2;

/**
 * Does this customer belong under the chip? Firestore applies the chip when it can; with a search
 * the order-count chips are checked here (they would need an index per sort and search word).
 */
export function matchesCustomerFilter(customer: Customer, filter: CustomerFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'repeat':
      return customer.orderCount >= REPEAT_ORDER_COUNT;
    case 'accounts':
      return customer.hasAccount;
    case 'guests':
      return !customer.hasAccount;
    case 'account-no-order':
      return customer.hasAccount && customer.orderCount === 0;
  }
}

/**
 * Firestore matched the longest word; every other typed word must be one of the customer's saved
 * search words too (they come from the same `orderSearchTokens()` the orders use).
 */
export function matchesAllCustomerWords(customer: Customer, words: readonly string[]): boolean {
  if (words.length < 2) return true;
  const tokens = new Set(customer.searchTokens);
  return words.every((word) => tokens.has(word));
}

/** What staff typed, as the words Firestore looks for plus, for an email, how it must start. */
export interface CustomerSearch {
  readonly words: readonly string[];
  /** The email start typed ("test2@te"); null when no "@" was typed. */
  readonly emailStart: string | null;
}

/**
 * The saved search words hold the whole email and the starts of its name part, never the starts of
 * the part after the "@". So a typed email start ("test2@", "test2@te") asks Firestore for the
 * longest word of its name part, and `matchesEmailStart()` then keeps only the emails that begin
 * with everything typed.
 */
export function customerSearch(typed: string): CustomerSearch {
  const text = typed.trim().toLowerCase();
  if (!text.includes('@')) return { words: orderSearchTerms(typed), emailStart: null };
  const nameWords = orderSearchWords(text.split('@')[0] ?? '').filter((word) => word.length >= 2);
  const longest = nameWords.reduce((best, word) => (word.length > best.length ? word : best), '');
  return { words: longest ? [longest] : orderSearchTerms(typed), emailStart: text };
}

/** With a typed email start, the customer's email (or an older spelling of it) must begin with it. */
export function matchesEmailStart(customer: Customer, emailStart: string | null): boolean {
  if (emailStart === null) return true;
  return [customer.email, ...customer.emailVariants].some((email) =>
    email.toLowerCase().startsWith(emailStart),
  );
}

export function sameSearch(left: CustomerSearch, right: CustomerSearch): boolean {
  return left.emailStart === right.emailStart && sameWords(left.words, right.words);
}

export function sameWords(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((word, index) => word === right[index]);
}

/** A saved date (Firestore Timestamp, Date or ISO text) as a Date; null when missing or unreadable. */
export function customerDate(value: Customer['lastOrderAt']): Date | null {
  if (value === null) return null;
  if (value instanceof Timestamp) return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Midnight on the 1st of this month, in the admin's own time. */
export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** "A" from "Ahmed Ali", "أ" from "أحمد"; the email's first letter when there is no name. */
export function customerInitial(customer: Customer): string {
  return accountInitial(customer.name.trim() || customer.email);
}

/** "9 Nov" this year, "9 Nov 2025" for an earlier year, so old orders don't look recent. */
export function lastOrderDateFormat(date: Date, now: Date): string {
  return date.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM y';
}

/** The name shown in the list; the email's name part when the customer has no name yet. */
export function customerDisplayName(customer: Customer): string {
  return customer.name.trim() || customer.email.split('@')[0] || customer.email;
}

/** "Account · 5 orders · Cairo" (phone cards). */
export function customerCardLine(customer: Customer): string {
  const parts = [customer.hasAccount ? 'Account' : 'Guest', orderCountLabel(customer.orderCount)];
  if (customer.city.trim()) parts.push(customer.city.trim());
  return parts.join(' · ');
}

export function orderCountLabel(count: number): string {
  return count === 1 ? '1 order' : `${count} orders`;
}

/** "15% of customers who ordered"; null when nobody ordered yet. */
export function repeatShareLine(repeat: number | null, ordered: number | null): string | null {
  if (repeat === null || ordered === null || ordered === 0) return null;
  return `${Math.round((repeat / ordered) * 100)}% of customers who ordered`;
}

/** "Showing 50 of 312 customers"; "Showing 3 customers" when the total isn't known (a search). */
export function showingLabel(shown: number, total: number | null): string {
  const noun = (count: number) => (count === 1 ? 'customer' : 'customers');
  if (total === null) return `Showing ${shown} ${noun(shown)}`;
  return `Showing ${shown} of ${total} ${noun(total)}`;
}
