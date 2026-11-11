import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, OnInit, PLATFORM_ID, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { SeoService } from '@core/services/seo';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import { OrderActionsComponent } from './components/order-actions/order-actions.component';
import { OrderInfoBoxesComponent } from './components/order-info-boxes/order-info-boxes.component';
import { OrderItemsComponent } from './components/order-items/order-items.component';
import type { OrderCard, OrderDetails, OrderStatusFilter } from './models/order-admin.model';
import { ORDER_STATUS_CONFIG } from './models/order-status-config';
import { OrdersAdminService } from './services/orders-admin.service';
import { groupOrderCards, toOrderLineAdminRows } from './utils/order-admin.utils';
import { orderDetails } from './utils/order-details.utils';
import { orderListError } from './utils/order-list-error';

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
    AppImageFallbackDirective,
    SharedIconModule,
    SkeletonComponent,
    StatusBadgeComponent,
    OrderActionsComponent,
    OrderInfoBoxesComponent,
    OrderItemsComponent,
  ],
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent implements OnInit {
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly statusFilter = signal<OrderStatusFilter>('all');
  readonly filterTabs = FILTER_TABS;

  /** The order opened in place (one at a time). */
  readonly openOrderId = signal<string | null>(null);

  readonly orderStatusConfig = ORDER_STATUS_CONFIG;

  readonly dataResource = resource({
    params: () => ({ status: this.statusFilter() }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { orders: [] as readonly OrderDoc[], productsById: new Map(), notesById: new Map() };
      }
      try {
        const orders = await this.#ordersAdmin.listOrders(params.status);
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
    const rows = toOrderLineAdminRows(data.orders, data.productsById, data.notesById);
    const details = new Map<string, OrderDetails>(
      data.orders.map((order) => [order.id, orderDetails(order, data.productsById)]),
    );
    return groupOrderCards(rows, details);
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

  toggle(orderId: string): void {
    this.openOrderId.update((open) => (open === orderId ? null : orderId));
  }

  reload(): void {
    this.dataResource.reload();
  }
}
