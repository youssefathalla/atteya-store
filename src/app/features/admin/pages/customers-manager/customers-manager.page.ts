import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { orderSearchTerms } from '@core/config/order-search';
import type { Customer } from '@core/services/customers';
import { SeoService } from '@core/services/seo';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import {
  CustomersAdminService,
  type CustomerPage,
  type CustomerPageQuery,
  type CustomerSummaryCounts,
} from './services/customers-admin.service';
import {
  CUSTOMER_FILTERS,
  CUSTOMER_SORTS,
  customerCardLine,
  customerDate,
  customerDisplayName,
  customerInitial,
  longestWord,
  matchesAllCustomerWords,
  matchesCustomerFilter,
  repeatShareLine,
  sameWords,
  showingLabel,
  startOfMonth,
  type CustomerFilter,
  type CustomerSort,
} from './utils/customers-list.utils';

const SEARCH_DELAY_MS = 300;

/** One customer row, with the text the row shows worked out once. */
interface CustomerRow {
  readonly customer: Customer;
  readonly name: string;
  readonly initial: string;
  readonly cardLine: string;
  readonly lastOrder: Date | null;
}

function toRow(customer: Customer): CustomerRow {
  return {
    customer,
    name: customerDisplayName(customer),
    initial: customerInitial(customer),
    cardLine: customerCardLine(customer),
    lastOrder: customerDate(customer.lastOrderAt),
  };
}

/**
 * Admin → Customers (ATS-277): everyone who placed an order or made an account, from the
 * `customers` collection (ATS-276). Summary boxes, search, one filter chip, a sort and 50 at a time.
 */
@Component({
  selector: 'app-customers-manager-page',
  host: { class: 'block w-full @container' },
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EgpPricePipe,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './customers-manager.page.html',
})
export class CustomersManagerPageComponent implements OnInit {
  readonly #customersAdmin = inject(CustomersAdminService);
  readonly #seo = inject(SeoService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly filters = CUSTOMER_FILTERS;
  readonly sorts = CUSTOMER_SORTS;

  readonly filter = signal<CustomerFilter>('all');
  readonly sort = signal<CustomerSort>('last-order');

  /** "Search customers" as typed; `searchTerms` follows it 300 ms after typing stops. */
  readonly searchText = signal('');
  readonly searchTerms = signal<readonly string[]>([], { equal: sameWords });

  constructor() {
    effect((onCleanup) => {
      const text = this.searchText();
      const timer = setTimeout(() => this.searchTerms.set(orderSearchTerms(text)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  readonly summaryResource = resource({
    loader: async (): Promise<CustomerSummaryCounts | null> =>
      this.#browser ? this.#customersAdmin.summary(startOfMonth(new Date())) : null,
  });

  readonly summary = computed(() => (this.summaryResource.hasValue() ? this.summaryResource.value() : null));
  readonly repeatLine = computed(() => {
    const counts = this.summary();
    return counts ? repeatShareLine(counts.repeat, counts.ordered) : null;
  });

  /** What the list shows; changing any of it starts again from the first page. */
  readonly #listKey = computed(
    () => ({ filter: this.filter(), sort: this.sort(), term: longestWord(this.searchTerms()) }),
    {
      equal: (left, right) =>
        left.filter === right.filter && left.sort === right.sort && left.term === right.term,
    },
  );

  /** Where the page being loaded starts (Show More Customers moves it on). */
  readonly #cursor = linkedSignal<unknown, QueryDocumentSnapshot<Customer> | null>({
    source: this.#listKey,
    computation: () => null,
  });

  readonly pageResource = resource({
    params: (): CustomerPageQuery => ({ ...this.#listKey(), after: this.#cursor() }),
    loader: async ({ params }): Promise<CustomerPage | null> => {
      if (!this.#browser) return null;
      try {
        return await this.#customersAdmin.listPage(params);
      } catch (error: unknown) {
        console.error('[admin/customers] load failed', error);
        throw error;
      }
    },
  });

  /** Every page loaded so far for the current search, filter and sort. */
  readonly #pages = linkedSignal<CustomerPage | null | undefined, readonly CustomerPage[]>({
    source: () => (this.pageResource.hasValue() ? this.pageResource.value() : undefined),
    computation: (page, previous) => {
      if (!page) return previous?.value ?? [];
      return page.query.after === null ? [page] : [...(previous?.value ?? []), page];
    },
  });

  readonly rows = computed((): readonly CustomerRow[] => {
    const words = this.searchTerms();
    const filter = this.filter();
    return this.#pages()
      .flatMap((page) => page.customers)
      .filter(
        (customer) => matchesAllCustomerWords(customer, words) && matchesCustomerFilter(customer, filter),
      )
      .map(toRow);
  });

  readonly #nextCursor = computed(() => this.#pages().at(-1)?.next ?? null);
  readonly hasMore = computed(() => this.#nextCursor() !== null);

  /** The first page of a new search, filter or sort is loading: show placeholder rows. */
  readonly firstLoading = computed(() => this.pageResource.isLoading() && this.#cursor() === null);
  readonly moreLoading = computed(() => this.pageResource.isLoading() && this.#cursor() !== null);
  readonly failed = computed(() => this.pageResource.status() === 'error');

  readonly searching = computed(() => this.searchTerms().length > 0);
  readonly searchQuote = computed(() => this.searchText().trim());

  /** The count for each chip; null while loading or when its read failed. */
  chipCount(filter: CustomerFilter): number | null {
    const counts = this.summary();
    if (!counts) return null;
    switch (filter) {
      case 'all':
        return counts.total;
      case 'repeat':
        return counts.repeat;
      case 'accounts':
        return counts.accounts;
      case 'guests':
        return counts.guests;
      case 'account-no-order':
        return counts.accountNoOrder;
    }
  }

  /** "Showing 50 of 312 customers"; with a search the total isn't known. */
  readonly showing = computed(() =>
    showingLabel(this.rows().length, this.searching() ? null : this.chipCount(this.filter())),
  );

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Customers | Atteya Admin',
      description: 'Everyone who placed an order or made an account.',
      noindex: true,
    });
  }

  setFilter(filter: CustomerFilter): void {
    this.filter.set(filter);
  }

  onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchText.set('');
    this.searchTerms.set([]);
  }

  showMore(): void {
    const next = this.#nextCursor();
    if (next) this.#cursor.set(next);
  }

  tryAgain(): void {
    this.pageResource.reload();
    if (this.summaryResource.status() === 'error') this.summaryResource.reload();
  }
}
