import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { orderSearchTerms, orderSearchTokens } from '@core/config/order-search';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { SeoService } from '@core/services/seo';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import { OrderActionsComponent } from './components/order-actions/order-actions.component';
import { OrderInfoBoxesComponent } from './components/order-info-boxes/order-info-boxes.component';
import { OrderItemsComponent } from './components/order-items/order-items.component';
import { OrdersFilterBarComponent } from './components/orders-filter-bar/orders-filter-bar.component';
import type { OrderCard, OrderDetails, OrderListQuery, OrderStatusFilter } from './models/order-admin.model';
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

  readonly dataResource = resource({
    params: (): OrderListQuery => {
      const date = this.dateFilter();
      return {
        status: this.statusFilter(),
        term: longestWord(this.searchTerms()),
        placed: date ? createdAtBounds(date) : null,
      };
    },
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { orders: [] as readonly OrderDoc[], productsById: new Map(), notesById: new Map() };
      }
      try {
        const orders = await this.#ordersAdmin.listOrders(params);
        const [productsById, notesById] = await Promise.all([
          this.#ordersAdmin.loadProductStock(orders),
          this.#ordersAdmin.loadStaffNotes(orders),
        ]);
        return { orders, productsById, notesById };
      } catch (error: unknown) {
        console.error('[admin/orders] load failed', error);
        throw error;
      }
    },
  });

  readonly loadErrorMessage = computed((): string | null => {
    const error = this.dataResource.error();
    return error == null ? null : orderListError(error);
  });

  readonly cards = computed((): readonly OrderCard[] => {
    const data = this.dataResource.value();
    if (!data) return [];
    // Firestore matched one word; every other typed word must match too.
    const terms = this.searchTerms();
    const orders =
      terms.length > 1 ? data.orders.filter((order) => matchesAllWords(order, terms)) : data.orders;
    const rows = toOrderLineAdminRows(orders, data.productsById, data.notesById);
    const details = new Map<string, OrderDetails>(
      orders.map((order) => [order.id, orderDetails(order, data.productsById)]),
    );
    return groupOrderCards(rows, details);
  });

  /** Firestore stopped at the page size, so older matches exist. */
  readonly hitLimit = computed(() => (this.dataResource.value()?.orders.length ?? 0) >= ORDERS_PAGE_SIZE);

  /** "3 orders", "1 order"; "Newest 50 orders" when there may be more. */
  readonly countLabel = computed(() => {
    const count = this.cards().length;
    if (this.hitLimit() && this.searchTerms().length < 2) return `Newest ${count} orders`;
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

  /** Passed to `app-order-actions`, which calls it after a save. */
  readonly reloadFn = (): void => {
    this.dataResource.reload();
  };
}
