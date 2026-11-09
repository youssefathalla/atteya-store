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
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import type { TableColumn } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import type { StatusConfig } from '@shared/ui/status-badge/status.model';
import {
  DeliveryFeeDialogComponent,
  type DeliveryFeeDialogData,
} from './dialogs/delivery-fee-dialog/delivery-fee-dialog.component';
import type { OrderLineAdminRow, OrderStatusFilter } from './models/order-admin.model';
import { OrdersAdminService } from './services/orders-admin.service';
import { orderActionError } from './utils/order-action-error';
import { toOrderLineAdminRows } from './utils/order-admin.utils';
import { orderListError } from './utils/order-list-error';

type OrderAction = 'confirm' | 'cancel' | 'fee';

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
    SharedIconModule,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent implements OnInit {
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #dialog = inject(MatDialog);
  readonly #platformId = inject(PLATFORM_ID);

  readonly statusFilter = signal<OrderStatusFilter>('pending');
  readonly filterTabs = FILTER_TABS;

  /** Order id currently being confirmed or cancelled (one action at a time). */
  readonly busyOrderId = signal<string | null>(null);
  readonly busyAction = signal<OrderAction | null>(null);

  private readonly orderCell = viewChild<TemplateRef<unknown>>('orderCell');
  private readonly statusCell = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly productCell = viewChild<TemplateRef<unknown>>('productCell');
  private readonly stockCell = viewChild<TemplateRef<unknown>>('stockCell');
  private readonly actionsCell = viewChild<TemplateRef<unknown>>('actionsCell');

  readonly sampleRow: OrderLineAdminRow = {
    id: '',
    orderId: '',
    orderRef: '',
    placedAtLabel: '',
    customerName: '',
    country: '',
    status: 'pending',
    paymentMethod: 'paymob',
    paymentLabel: '',
    productId: '',
    productName: '',
    giftName: null,
    dealLabel: null,
    selectionLabel: '',
    quantity: 0,
    currentStock: null,
    stockStatus: 'unset',
    orderTotalLabel: '',
    phone: '',
    stage: 'unknown',
    isFirstLine: false,
    whatsappUrl: null,
    confirmAction: null,
    canCancel: false,
    amountDueLabel: null,
    deliveryFeeAction: null,
    deliveryFeeEgp: null,
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
      description: 'Review orders, confirm payments, and check live product stock beside each line.',
      noindex: true,
    });
  }

  stockCountLabel(row: OrderLineAdminRow): string {
    if (row.currentStock === null) return '—';
    return String(row.currentStock);
  }

  isBusy(row: OrderLineAdminRow, action: OrderAction): boolean {
    return this.busyOrderId() === row.orderId && this.busyAction() === action;
  }

  /**
   * Cash on delivery: "Confirm order" (shipping fee received, or free shipping).
   * InstaPay: "Confirm payment" after a check that the money arrived in the bank app.
   * Both take the items out of stock on the server.
   */
  async confirm(row: OrderLineAdminRow): Promise<void> {
    if (!row.isFirstLine || !row.confirmAction || this.busyOrderId()) return;
    if (row.confirmAction === 'confirm-payment') {
      const ok = await this.#ask({
        title: `Confirm payment for ${row.orderRef}?`,
        message: `Only confirm after you see ${row.amountDueLabel ?? 'the full amount'} arrive in your bank app. A screenshot alone isn't proof. This takes the items out of stock and emails the shopper.`,
        confirmText: 'Payment Received',
        cancelText: 'Not Yet',
        theme: 'primary',
      });
      if (!ok) return;
    }
    await this.#run(row, 'confirm', async () => {
      await this.#ordersAdmin.confirmCodOrder(row.orderId);
      this.#snackbar.success(
        row.confirmAction === 'confirm-payment'
          ? 'Payment confirmed. Stock updated.'
          : 'Order confirmed. Stock updated.',
      );
    });
  }

  /**
   * Large Egypt order: save the delivery fee agreed with the shopper on WhatsApp. Sets the order
   * total, so the shopper's order page shows what to pay; Confirm unlocks after this.
   */
  async setDeliveryFee(row: OrderLineAdminRow): Promise<void> {
    if (!row.isFirstLine || !row.deliveryFeeAction || this.busyOrderId()) return;
    const ref = this.#dialog.open<DeliveryFeeDialogComponent, DeliveryFeeDialogData, number>(
      DeliveryFeeDialogComponent,
      { data: { orderRef: row.orderRef, currentFeeEgp: row.deliveryFeeEgp }, width: '440px' },
    );
    const fee = await firstValueFrom(ref.afterClosed());
    if (typeof fee !== 'number') return;
    await this.#run(row, 'fee', async () => {
      await this.#ordersAdmin.setDeliveryFee(row.orderId, fee);
      this.#snackbar.success('Delivery fee saved.');
    });
  }

  /** Cancel an open order that was never paid. Nothing was taken out of stock. */
  async cancel(row: OrderLineAdminRow): Promise<void> {
    if (!row.isFirstLine || !row.canCancel || this.busyOrderId()) return;
    const ok = await this.#ask({
      title: `Cancel order ${row.orderRef}?`,
      message:
        "The shopper won't be able to pay for it after this. Nothing was taken out of stock, so there's nothing to put back. No email is sent; message the shopper on WhatsApp if needed.",
      confirmText: 'Cancel Order',
      cancelText: 'Keep Order',
      theme: 'error',
    });
    if (!ok) return;
    await this.#run(row, 'cancel', async () => {
      await this.#ordersAdmin.cancelOrder(row.orderId);
      this.#snackbar.success('Order cancelled.');
    });
  }

  /** The number can't be turned into a WhatsApp link safely: let staff copy and check it. */
  showCopyPhone(row: OrderLineAdminRow): boolean {
    return (
      !row.whatsappUrl && row.stage !== 'paymob-pending' && row.stage !== 'unknown' && !!row.phone
    );
  }

  async copyPhone(row: OrderLineAdminRow): Promise<void> {
    try {
      await navigator.clipboard.writeText(row.phone);
      this.#snackbar.success('Phone number copied.');
    } catch {
      this.#snackbar.info(`Couldn't copy. The number is ${row.phone}.`);
    }
  }

  async #run(
    row: OrderLineAdminRow,
    action: OrderAction,
    work: () => Promise<void>,
  ): Promise<void> {
    this.busyOrderId.set(row.orderId);
    this.busyAction.set(action);
    try {
      await work();
      this.dataResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(orderActionError(error));
    } finally {
      this.busyOrderId.set(null);
      this.busyAction.set(null);
    }
  }

  async #ask(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data, width: '440px' },
    );
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
