import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { orderSearchTerms, orderSearchTokens } from '@core/config/order-search';
import type { OrderDoc, OrderStaffNotes } from '@core/services/orders/order.schema';
import { SeoService } from '@core/services/seo';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import { OrderActionsComponent } from './components/order-actions/order-actions.component';
import { OrderInfoBoxesComponent } from './components/order-info-boxes/order-info-boxes.component';
import { OrderItemsComponent } from './components/order-items/order-items.component';
import { OrdersFilterBarComponent } from './components/orders-filter-bar/orders-filter-bar.component';
import type {
  OrderCard,
  OrderDetails,
  OrderListQuery,
  OrderStatusFilter,
  ProductStockLookup,
} from './models/order-admin.model';
import { ORDER_STATUS_CONFIG } from './models/order-status-config';
import { ORDERS_PAGE_SIZE, OrdersAdminService } from './services/orders-admin.service';
import { createdAtBounds, orderDateRangeLabel, type OrderDateFilter } from './utils/order-date-filter.utils';
import { groupOrderCards, toOrderLineAdminRows } from './utils/order-admin.utils';
import { orderDetails } from './utils/order-details.utils';
import { orderListError } from './utils/order-list-error';

const SEARCH_DELAY_MS = 300;

function sameWords(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((word, index) => word === right[index]);
}

/** The word Firestore looks up: the longest one matches the fewest orders. */
function longestWord(words: readonly string[]): string | null {
  return words.reduce<string | null>(
    (best, word) => (best === null || word.length > best.length ? word : best),
    null,
  );
}

function matchesAllWords(order: OrderDoc, words: readonly string[]): boolean {
  const tokens = new Set(
    orderSearchTokens({
      orderId: order.id,
      fullName: order.shipping.fullName,
      phone: order.shipping.phone,
      email: order.customerEmail,
    }),
  );
  return words.every((word) => tokens.has(word));
}

/** What the next read asks for (ATS-286). */
interface OrdersRequest {
  /** Where the batch starts; null reads from the newest. */
  readonly after: QueryDocumentSnapshot<OrderDoc> | null;
  readonly size: number;
  /** False for a new filter (skeleton); true for Show More Orders and a reload after a save. */
  readonly keep: boolean;
}

/** One batch read, with the stock and staff notes for its orders only. */
interface OrdersPage {
  readonly request: OrdersRequest;
  readonly orders: readonly OrderDoc[];
  readonly next: QueryDocumentSnapshot<OrderDoc> | null;
  readonly productsById: ReadonlyMap<string, ProductStockLookup>;
  readonly notesById: ReadonlyMap<string, OrderStaffNotes>;
}

const FIRST_REQUEST: OrdersRequest = { after: null, size: ORDERS_PAGE_SIZE, keep: false };

const FILTER_TABS: readonly { readonly id: OrderStatusFilter; readonly label: string }[] = [
  { id: 'all', label: 'All Recent' },
  { id: 'pending', label: 'Waiting for Payment' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'failed', label: 'Payment Failed' },
  { id: 'cancelled', label: 'Cancelled' },
];

@Component({
  selector: 'app-orders-manager-page',
  host: { class: 'block w-full @container' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    AppImageFallbackDirective,
    SharedIconModule,
    SkeletonComponent,
    StatusBadgeComponent,
    OrderActionsComponent,
    OrderInfoBoxesComponent,
    OrderItemsComponent,
    OrdersFilterBarComponent,
  ],
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent implements OnInit {
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);

  readonly statusFilter = signal<OrderStatusFilter>('all');
  readonly filterTabs = FILTER_TABS;

  /** "Search orders" as typed; `searchTerms` follows it 300 ms after typing stops. */
  readonly searchText = signal('');
  readonly searchTerms = signal<readonly string[]>([], { equal: sameWords });
  readonly dateFilter = signal<OrderDateFilter | null>(null);

  readonly #now = new Date();
  readonly dateChipLabel = computed(() => {
    const filter = this.dateFilter();
    return filter ? orderDateRangeLabel(filter, this.#now) : null;
  });
  readonly hasFilters = computed(() => this.searchTerms().length > 0 || this.dateFilter() !== null);

  /** The order opened in place (one at a time). */
  readonly openOrderId = signal<string | null>(null);

  readonly orderStatusConfig = ORDER_STATUS_CONFIG;

  constructor() {
    effect((onCleanup) => {
      const text = this.searchText();
      const timer = setTimeout(() => this.searchTerms.set(orderSearchTerms(text)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  readonly #query = computed((): OrderListQuery => {
    const date = this.dateFilter();
    return {
      status: this.statusFilter(),
      term: longestWord(this.searchTerms()),
      placed: date ? createdAtBounds(date) : null,
    };
  });

  /** A new status tab, search or dates goes back to the first batch. */
  readonly #request = linkedSignal<OrderListQuery, OrdersRequest>({
    source: this.#query,
    computation: () => FIRST_REQUEST,
  });

  readonly dataResource = resource({
    params: () => ({ filter: this.#query(), request: this.#request() }),
    loader: async ({ params: { filter, request } }): Promise<OrdersPage> => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { request, orders: [], next: null, productsById: new Map(), notesById: new Map() };
      }
      try {
        const { orders, next } = await this.#ordersAdmin.listOrders(filter, request.after, request.size);
        const [productsById, notesById] = await Promise.all([
          this.#ordersAdmin.loadProductStock(orders),
          this.#ordersAdmin.loadStaffNotes(orders),
        ]);
        return { request, orders, next, productsById, notesById };
      } catch (error: unknown) {
        console.error('[admin/orders] load failed', error);
        throw error;
      }
    },
  });

  /**
   * Every batch on screen. A new filter starts over, Show More Orders adds the next batch under the
   * others, and a reload after a save swaps them all for one fresh read.
   */
  readonly #pages = linkedSignal<
    { readonly page: OrdersPage | undefined; readonly request: OrdersRequest },
    readonly OrdersPage[]
  >({
    source: () => ({
      page: this.dataResource.hasValue() ? this.dataResource.value() : undefined,
      request: this.#request(),
    }),
    computation: ({ page, request }, previous) => {
      const kept = previous?.value ?? [];
      if (!page || page.request !== request) return request.keep ? kept : [];
      if (kept.at(-1)?.request === request) return kept;
      return request.after === null ? [page] : [...kept, page];
    },
  });

  /** Orders on screen, oldest batch last; an order that shows up in two batches is kept once. */
  readonly #orders = computed((): readonly OrderDoc[] => {
    const seen = new Set<string>();
    const orders: OrderDoc[] = [];
    for (const page of this.#pages()) {
      for (const order of page.orders) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        orders.push(order);
      }
    }
    return orders;
  });

  readonly #productsById = computed(() => new Map(this.#pages().flatMap((page) => [...page.productsById])));
  readonly #notesById = computed(() => new Map(this.#pages().flatMap((page) => [...page.notesById])));

  readonly #next = computed(() => this.#pages().at(-1)?.next ?? null);
  /** The last batch came back full, so older orders may exist. */
  readonly hasMore = computed(() => this.#next() !== null);
  /** How many orders were read (before the extra search words are checked). */
  readonly checkedCount = computed(() => this.#orders().length);

  readonly firstLoading = computed(() => this.dataResource.isLoading() && this.#pages().length === 0);
  readonly moreLoading = computed(() => this.dataResource.isLoading() && this.#pages().length > 0);

  readonly loadErrorMessage = computed((): string | null => {
    if (this.#pages().length > 0) return null;
    const error = this.dataResource.error();
    return error == null ? null : orderListError(error);
  });

  /** A later read failed while orders are on screen; they stay and a Try Again shows under them. */
  readonly moreErrorMessage = computed((): string | null => {
    if (this.#pages().length === 0 || this.dataResource.error() == null) return null;
    return this.#request().after === null
      ? "We couldn't refresh the orders."
      : "We couldn't load more orders.";
  });

  readonly cards = computed((): readonly OrderCard[] => {
    // Firestore matched one word; every other typed word must match too.
    const terms = this.searchTerms();
    const all = this.#orders();
    const orders = terms.length > 1 ? all.filter((order) => matchesAllWords(order, terms)) : all;
    const productsById = this.#productsById();
    const rows = toOrderLineAdminRows(orders, productsById, this.#notesById());
    const details = new Map<string, OrderDetails>(
      orders.map((order) => [order.id, orderDetails(order, productsById)]),
    );
    return groupOrderCards(rows, details);
  });

  /**
   * "3 orders", "1 order"; "Newest 100 orders" when there may be more. With several words,
   * Firestore only matched one of them, so the label says the matches come from the orders read.
   */
  readonly countLabel = computed(() => {
    const count = this.cards().length;
    if (this.hasMore()) {
      if (this.searchTerms().length < 2) return `Newest ${count} orders`;
      const matches = count === 1 ? '1 match' : `${count} matches`;
      return `${matches} among the newest ${this.checkedCount()} orders`;
    }
    return count === 1 ? '1 order' : `${count} orders`;
  });

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Orders | Atteya Admin',
      description: 'Review orders, confirm payments, and check live product stock beside each line.',
      noindex: true,
    });
  }

  setFilter(id: OrderStatusFilter): void {
    this.statusFilter.set(id);
    this.openOrderId.set(null);
  }

  onSearchChange(text: string): void {
    this.searchText.set(text);
    this.openOrderId.set(null);
  }

  onDateChange(filter: OrderDateFilter | null): void {
    this.dateFilter.set(filter);
    this.openOrderId.set(null);
  }

  clearSearch(): void {
    this.searchText.set('');
    this.searchTerms.set([]);
  }

  clearAll(): void {
    this.clearSearch();
    this.dateFilter.set(null);
    this.openOrderId.set(null);
  }

  /** "Waiting for Payment" for the black bar (the badge colours don't work on black). */
  statusLabel(status: string): string {
    return this.orderStatusConfig[status]?.label ?? status;
  }

  /**
   * Open or close one order (one at a time). Opening scrolls its bar to the top of the screen;
   * closing scrolls back to its row only when the row went above the screen.
   */
  toggle(orderId: string): void {
    const opening = this.openOrderId() !== orderId;
    this.openOrderId.set(opening ? orderId : null);
    this.#scrollToOrder(orderId, opening);
  }

  /** The bar's ‹ › buttons: open the order before or after the open one. */
  openAt(index: number): void {
    const card = this.cards()[index];
    if (!card) return;
    this.openOrderId.set(card.orderId);
    this.#scrollToOrder(card.orderId, true);
  }

  #scrollToOrder(orderId: string, always: boolean): void {
    afterNextRender(
      () => {
        const item = this.#host.nativeElement.querySelector<HTMLElement>(
          `[data-order-id="${CSS.escape(orderId)}"]`,
        );
        if (!item || (!always && item.getBoundingClientRect().top >= 0)) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        item.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      },
      { injector: this.#injector },
    );
  }

  /** Reads the next 50 orders and adds them under the ones on screen. */
  showMore(): void {
    const next = this.#next();
    if (!next || this.dataResource.isLoading()) return;
    this.#request.set({ after: next, size: ORDERS_PAGE_SIZE, keep: true });
  }

  retryLoad(): void {
    this.dataResource.reload();
  }

  /**
   * Passed to `app-order-actions`, which calls it after a save. Reads again as many orders as are on
   * screen, in one go, so the list stays as long as it was.
   */
  readonly reloadFn = (): void => {
    const loaded = this.checkedCount();
    const size = Math.max(ORDERS_PAGE_SIZE, Math.ceil(loaded / ORDERS_PAGE_SIZE) * ORDERS_PAGE_SIZE);
    this.#request.set({ after: null, size, keep: true });
  };
}
