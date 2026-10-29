import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import type { TableColumn } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import type { StatusConfig } from '@shared/ui/status-badge/status.model';
import type { OrderLineAdminRow, OrderStatusFilter } from './models/order-admin.model';
import { OrdersAdminService } from './services/orders-admin.service';
import { orderActionError } from './utils/order-action-error';
import { toOrderLineAdminRows } from './utils/order-admin.utils';
import { orderListError } from './utils/order-list-error';

const FILTER_TABS: readonly { readonly id: OrderStatusFilter; readonly label: string }[] = [
  { id: 'pending', label: 'Open' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All recent' },
];

@Component({
  selector: 'app-orders-manager-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    TemplateTypeDirective,
    ReusableTable,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent implements OnInit {
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly statusFilter = signal<OrderStatusFilter>('pending');
  readonly filterTabs = FILTER_TABS;

  /** Order id currently running confirmCodOrder. */
  readonly confirmingOrderId = signal<string | null>(null);

  private readonly orderCell = viewChild<TemplateRef<unknown>>('orderCell');
  private readonly statusCell = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly productCell = viewChild<TemplateRef<unknown>>('productCell');
  private readonly stockCell = viewChild<TemplateRef<unknown>>('stockCell');
  private readonly actionsCell = viewChild<TemplateRef<unknown>>('actionsCell');

  readonly sampleRow: OrderLineAdminRow = {
    id: '',
    orderId: '',
    placedAtLabel: '',
    customerName: '',
    country: '',
    status: 'pending',
    paymentMethod: 'paymob',
    paymentLabel: '',
    productId: '',
    productName: '',
    selectionLabel: '',
    quantity: 0,
    currentStock: null,
    stockStatus: 'unset',
    orderTotalLabel: '',
  };

  readonly orderStatusConfig: Record<string, StatusConfig> = {
    pending: { label: 'Open', color: 'yellow' },
    confirmed: { label: 'Confirmed', color: 'green' },
    failed: { label: 'Failed', color: 'red' },
    cancelled: { label: 'Cancelled', color: 'gray' },
  };

  readonly stockStatusConfig: Record<string, StatusConfig> = {
    in: { label: 'In stock', color: 'green' },
    out: { label: 'Out of stock', color: 'red' },
    unset: { label: 'Not set', color: 'gray' },
    missing: { label: 'Missing product', color: 'red' },
  };

  readonly dataResource = resource({
    params: () => ({ status: this.statusFilter() }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { orders: [], productsById: new Map() };
      }
      try {
        const orders = await this.#ordersAdmin.listOrders(params.status);
        const productsById = await this.#ordersAdmin.loadProductStock(orders);
        return { orders, productsById };
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

  readonly rows = computed((): OrderLineAdminRow[] => {
    const data = this.dataResource.value();
    if (!data) return [];
    return [...toOrderLineAdminRows(data.orders, data.productsById)];
  });

  readonly columns = computed((): TableColumn<OrderLineAdminRow>[] => [
    { key: 'orderId', label: 'Order', sortable: true, customCellTpl: this.orderCell() },
    { key: 'status', label: 'Status', sortable: true, customCellTpl: this.statusCell() },
    { key: 'productName', label: 'Product', sortable: true, customCellTpl: this.productCell() },
    { key: 'selectionLabel', label: 'Options', sortable: false },
    { key: 'quantity', label: 'Qty', sortable: true },
    { key: 'currentStock', label: 'Current stock', sortable: true, customCellTpl: this.stockCell() },
    { key: 'orderTotalLabel', label: 'Order total', sortable: false },
    { key: 'id', label: 'Actions', sortable: false, customCellTpl: this.actionsCell() },
  ]);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Orders | Atteya Admin',
      description: 'Review orders and check live product stock beside each line.',
      noindex: true,
    });
  }

  stockCountLabel(row: OrderLineAdminRow): string {
    if (row.currentStock === null) return '—';
    return String(row.currentStock);
  }

  /** Show Confirm once per pending COD order (first line only). */
  showConfirmCod(row: OrderLineAdminRow): boolean {
    if (row.paymentMethod !== 'cash-on-delivery' || row.status !== 'pending') return false;
    return this.rows().find((item) => item.orderId === row.orderId)?.id === row.id;
  }

  async confirmCod(row: OrderLineAdminRow): Promise<void> {
    if (!this.showConfirmCod(row) || this.confirmingOrderId()) return;
    this.confirmingOrderId.set(row.orderId);
    try {
      await this.#ordersAdmin.confirmCodOrder(row.orderId);
      this.#snackbar.success('Order confirmed. Stock updated.');
      this.dataResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(orderActionError(error));
    } finally {
      this.confirmingOrderId.set(null);
    }
  }
}
