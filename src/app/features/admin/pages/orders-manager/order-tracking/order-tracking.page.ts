import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, OnInit, PLATFORM_ID, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SeoService } from '@core/services/seo';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import { OrderActionsComponent } from '../components/order-actions/order-actions.component';
import { OrderInfoBoxesComponent } from '../components/order-info-boxes/order-info-boxes.component';
import { OrderItemsComponent } from '../components/order-items/order-items.component';
import { ORDER_STATUS_CONFIG } from '../models/order-status-config';
import { OrdersAdminService } from '../services/orders-admin.service';
import { toOrderLineAdminRows } from '../utils/order-admin.utils';
import { orderDetails } from '../utils/order-details.utils';
import { orderListError } from '../utils/order-list-error';
import { trackingSteps } from '../utils/order-tracking.utils';

/**
 * One order in full: the header with its actions, the items and money, progress and every change
 * on the left, Customer, Delivery Address and Payment on the right. Below desktop width the
 * right-hand boxes come first, then the items.
 */
@Component({
  selector: 'app-order-tracking-page',
  host: { class: 'block w-full @container' },
  imports: [
    RouterLink,
    MatButtonModule,
    SharedIconModule,
    SkeletonComponent,
    StatusBadgeComponent,
    OrderActionsComponent,
    OrderInfoBoxesComponent,
    OrderItemsComponent,
  ],
  templateUrl: './order-tracking.page.html',
})
export class OrderTrackingPageComponent implements OnInit {
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);

  /** From the `:orderId` route segment. */
  readonly orderId = input.required<string>();

  readonly orderStatusConfig = ORDER_STATUS_CONFIG;

  readonly dataResource = resource({
    params: () => ({ id: this.orderId() }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const order = await this.#ordersAdmin.getOrder(params.id);
      if (!order) return null;
      const [productsById, notesById] = await Promise.all([
        this.#ordersAdmin.loadProductStock([order]),
        this.#ordersAdmin.loadStaffNotes([order]),
      ]);
      return { order, productsById, notesById };
    },
  });

  readonly loadErrorMessage = computed((): string | null => {
    const error = this.dataResource.error();
    return error == null ? null : orderListError(error);
  });

  readonly first = computed(() => {
    const data = this.dataResource.value();
    return data ? (toOrderLineAdminRows([data.order], data.productsById, data.notesById)[0] ?? null) : null;
  });

  readonly details = computed(() => {
    const data = this.dataResource.value();
    return data ? orderDetails(data.order, data.productsById) : null;
  });

  readonly steps = computed(() => {
    const data = this.dataResource.value();
    return data ? trackingSteps(data.order) : [];
  });

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Order | Atteya Admin',
      description: 'Everything about one order: customer, delivery address, items, payment and progress.',
      noindex: true,
    });
  }

  /** Passed to `app-order-actions`, which calls it after a save. */
  readonly reloadFn = (): void => {
    this.dataResource.reload();
  };
}
