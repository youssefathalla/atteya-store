import { Service } from '@angular/core';
import {
  average,
  collection,
  getAggregateFromServer,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CUSTOMERS_COLLECTION, customerConverter, type Customer } from '@core/services/customers';
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
            return value === null ? 0 : Math.round(value);
          }),
        ),
        count(where('hasAccount', '==', true)),
        count(where('hasAccount', '==', false)),
        count(where('hasAccount', '==', true), where('orderCount', '==', 0)),
      ]);

    return { total, newThisMonth, ordered, repeat, averageSpentEgp, accounts, guests, accountNoOrder };
  }
}
