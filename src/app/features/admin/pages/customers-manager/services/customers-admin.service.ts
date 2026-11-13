import { Service } from '@angular/core';
import {
  average,
  collection,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import {
  CUSTOMER_NOTES_COLLECTION,
  CUSTOMERS_COLLECTION,
  customerConverter,
  customerNoteConverter,
  type Customer,
  type CustomerNote,
} from '@core/services/customers';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from '@core/services/orders/order.schema';
import { SavedAddressSchema, USERS_COLLECTION, type SavedAddress } from '@core/services/user-profile';
import {
  CUSTOMER_ORDERS_PAGE_SIZE,
  orderEmailValues,
} from '../customer-details/utils/customer-details.utils';
import {
  CUSTOMER_SORT_FIELD,
  CUSTOMERS_PAGE_SIZE,
  REPEAT_ORDER_COUNT,
  type CustomerFilter,
  type CustomerSort,
} from '../utils/customers-list.utils';

export interface CustomerPageQuery {
  readonly filter: CustomerFilter;
  readonly sort: CustomerSort;
  /** The longest typed search word, or null. */
  readonly term: string | null;
  /** The last customer of the page before; null for the first page. */
  readonly after: QueryDocumentSnapshot<Customer> | null;
}

export interface CustomerPage {
  readonly query: CustomerPageQuery;
  readonly customers: readonly Customer[];
  /** Where the next page starts; null when this page was the last. */
  readonly next: QueryDocumentSnapshot<Customer> | null;
}

/** A number for a summary box or chip; null when its read failed (the box shows "—"). */
export type CustomerCount = number | null;

export interface CustomerSummaryCounts {
  readonly total: CustomerCount;
  readonly newThisMonth: CustomerCount;
  readonly ordered: CustomerCount;
  readonly repeat: CustomerCount;
  readonly averageSpentEgp: CustomerCount;
  readonly accounts: CustomerCount;
  readonly guests: CustomerCount;
  readonly accountNoOrder: CustomerCount;
}

/** One page of a customer's orders (customer page, ATS-278). */
export interface CustomerOrdersPage {
  readonly orders: readonly OrderDoc[];
  /** Where the next page starts; null when this page was the last. */
  readonly next: QueryDocumentSnapshot | null;
}

/** Firestore filters for a chip. With a search, only the account filters run on the server. */
function filterConstraints(filter: CustomerFilter, searching: boolean): QueryConstraint[] {
  switch (filter) {
    case 'all':
      return [];
    case 'repeat':
      return searching ? [] : [where('orderCount', '>=', REPEAT_ORDER_COUNT)];
    case 'accounts':
      return [where('hasAccount', '==', true)];
    case 'guests':
      return [where('hasAccount', '==', false)];
    case 'account-no-order':
      return searching
        ? [where('hasAccount', '==', true)]
        : [where('hasAccount', '==', true), where('orderCount', '==', 0)];
  }
}

async function settled<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error: unknown) {
    console.error('[admin/customers] summary read failed', error);
    return null;
  }
}

/**
 * Reads `customers` (ATS-276) for the admin Customers list (ATS-277). Lists page with a cursor;
 * every number on the page is a server count or average, never a read of every customer.
 */
@Service()
export class CustomersAdminService {
  readonly #firestore = injectFirestore();

  #collection() {
    return collection(this.#firestore, CUSTOMERS_COLLECTION).withConverter(customerConverter);
  }

  /**
   * One page of up to `CUSTOMERS_PAGE_SIZE` customers. "Account, No Order Yet" is always newest
   * customers first: every other sort is the same (no orders, nothing spent) for all of them.
   */
  async listPage(page: CustomerPageQuery): Promise<CustomerPage> {
    const searching = page.term !== null;
    const sortField = page.filter === 'account-no-order' ? 'createdAt' : CUSTOMER_SORT_FIELD[page.sort];
    const constraints: QueryConstraint[] = [
      ...(searching ? [where('searchTokens', 'array-contains', page.term)] : []),
      ...filterConstraints(page.filter, searching),
      orderBy(sortField, 'desc'),
      ...(page.after ? [startAfter(page.after)] : []),
      limit(CUSTOMERS_PAGE_SIZE),
    ];
    const snap = await getDocs(query(this.#collection(), ...constraints));
    const docs = snap.docs;
    return {
      query: page,
      customers: docs.map((item) => item.data()),
      next: docs.length === CUSTOMERS_PAGE_SIZE ? (docs[docs.length - 1] ?? null) : null,
    };
  }

  /** The summary boxes and chip counts. Each number is read on its own; a failed one is null. */
  async summary(monthStart: Date): Promise<CustomerSummaryCounts> {
    const col = this.#collection();
    const count = (...constraints: QueryConstraint[]) =>
      settled(getCountFromServer(query(col, ...constraints)).then((snap) => snap.data().count));

    const [total, newThisMonth, ordered, repeat, averageSpentEgp, accounts, guests, accountNoOrder] =
      await Promise.all([
        count(),
        count(where('createdAt', '>=', Timestamp.fromDate(monthStart))),
        count(where('orderCount', '>=', 1)),
        count(where('orderCount', '>=', REPEAT_ORDER_COUNT)),
        settled(
          getAggregateFromServer(query(col, where('spentEgp', '>', 0)), {
            spent: average('spentEgp'),
          }).then((snap) => {
            const value = snap.data().spent;
            return value === null ? null : Math.round(value);
          }),
        ),
        count(where('hasAccount', '==', true)),
        count(where('hasAccount', '==', false)),
        count(where('hasAccount', '==', true), where('orderCount', '==', 0)),
      ]);

    return { total, newThisMonth, ordered, repeat, averageSpentEgp, accounts, guests, accountNoOrder };
  }

  /** One customer by id (customer page, ATS-278); null when there is no such customer. */
  async getCustomer(customerId: string): Promise<Customer | null> {
    const snap = await getDoc(doc(this.#collection(), customerId));
    return snap.exists() ? snap.data() : null;
  }

  /**
   * Up to `CUSTOMER_ORDERS_PAGE_SIZE` of the customer's orders, newest placed first: every order
   * saved with their email (lower-cased, or another spelling the customer summary found).
   */
  async listOrders(customer: Customer, after: QueryDocumentSnapshot | null): Promise<CustomerOrdersPage> {
    const orders = collection(this.#firestore, ORDERS_COLLECTION);
    const snap = await getDocs(
      query(
        orders,
        where('customerEmail', 'in', orderEmailValues(customer)),
        orderBy('createdAt', 'desc'),
        ...(after ? [startAfter(after)] : []),
        limit(CUSTOMER_ORDERS_PAGE_SIZE),
      ),
    );
    const docs = snap.docs;
    const parsed: OrderDoc[] = [];
    for (const item of docs) {
      // One order that doesn't parse is left out instead of failing the whole card.
      const result = v.safeParse(OrderSchema, {
        ...item.data({ serverTimestamps: 'estimate' }),
        id: item.id,
      });
      if (result.success) parsed.push(result.output);
    }
    return {
      orders: parsed,
      next: docs.length === CUSTOMER_ORDERS_PAGE_SIZE ? (docs[docs.length - 1] ?? null) : null,
    };
  }

  /** The address saved on the account (`users/{uid}.address`); null when none or unreadable. */
  async getAccountAddress(uid: string): Promise<SavedAddress | null> {
    const snap = await getDoc(doc(this.#firestore, USERS_COLLECTION, uid));
    if (!snap.exists()) return null;
    const parsed = v.safeParse(SavedAddressSchema, snap.get('address'));
    return parsed.success ? parsed.output : null;
  }

  /** The staff note on a customer; null when nobody wrote one yet. */
  async getNote(customerId: string): Promise<CustomerNote | null> {
    const snap = await getDoc(
      doc(this.#firestore, CUSTOMER_NOTES_COLLECTION, customerId).withConverter(customerNoteConverter),
    );
    return snap.exists() ? snap.data() : null;
  }

  /** Saves the whole note (the rules check the length, the server time and the saver's uid). */
  async saveNote(customerId: string, note: string, uid: string, email: string): Promise<void> {
    await setDoc(doc(this.#firestore, CUSTOMER_NOTES_COLLECTION, customerId), {
      note,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      updatedByEmail: email,
    });
  }
}
