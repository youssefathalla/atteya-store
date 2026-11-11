import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, OnInit, PLATFORM_ID, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SeoService } from '@core/services/seo';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import type { StatusConfig } from '@shared/ui/status-badge/status.model';
import { OrdersAdminService } from '../services/orders-admin.service';
import { toOrderLineAdminRows } from '../utils/order-admin.utils';
import { orderListError } from '../utils/order-list-error';
import { trackingSteps } from '../utils/order-tracking.utils';

@Component({
  selector: 'app-order-tracking-page',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule, SharedIconModule, SkeletonComponent, StatusBadgeComponent],
  templateUrl: './order-tracking.page.html',
})
export class OrderTrackingPageComponent implements OnInit {
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);

  /** From the `:orderId` route segment. */
  readonly orderId = input.required<string>();

  readonly orderStatusConfig: Record<string, StatusConfig> = {
    pending: { label: 'Waiting for Payment', color: 'yellow' },
    confirmed: { label: 'Confirmed', color: 'blue' },
    shipped: { label: 'Shipped', color: 'primary' },
    delivered: { label: 'Delivered', color: 'green' },
    failed: { label: 'Payment Failed', color: 'red' },
    cancelled: { label: 'Cancelled', color: 'gray' },
  };

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

  readonly rows = computed(() => {
    const data = this.dataResource.value();
    return data ? toOrderLineAdminRows([data.order], data.productsById, data.notesById) : [];
  });

  readonly first = computed(() => this.rows()[0] ?? null);

  readonly steps = computed(() => {
    const data = this.dataResource.value();
    return data ? trackingSteps(data.order) : [];
  });

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Track Order | Atteya Admin',
      description: 'Follow an order from placed to delivered, with the date of every status change.',
      noindex: true,
    });
  }
}
