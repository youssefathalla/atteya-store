import { Component, inject, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from '@core/services/orders/order.schema';
import { displayDecimals } from '@core/services/offers/engine';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';
import { OrdersAdminService } from './services/orders-admin.service';
import { orderActionError } from './utils/order-action-error';

@Component({
  selector: 'app-orders-manager-page',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent {
  readonly #firestore = injectFirestore();
  readonly #ordersAdmin = inject(OrdersAdminService);
  readonly #snackbar = inject(SnackbarService);

  /** Order id currently running confirmCodOrder. */
  readonly confirmingOrderId = signal<string | null>(null);

  readonly pendingResource = resource({
    loader: async () => {
      const converter = createValibotConverter(OrderSchema);
      const snap = await getDocs(
        query(
          collection(this.#firestore, ORDERS_COLLECTION).withConverter(converter),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
      );
      return snap.docs.map((docSnap) => docSnap.data());
    },
  });

  formatPlacedAt(order: OrderDoc): string {
    const raw = order.createdAt;
    const date =
      raw instanceof Date
        ? raw
        : typeof raw === 'object' && raw && 'toDate' in raw && typeof raw.toDate === 'function'
          ? raw.toDate()
          : null;
    return date ? date.toLocaleString() : '';
  }

  formatTotal(order: OrderDoc): string {
    return formatMoney(
      order.pricing.totalDisplay,
      order.pricing.currency,
      displayDecimals(order.pricing.currency),
    );
  }

  paymentLabel(order: OrderDoc): string {
    if (order.paymentMethod === 'cash-on-delivery') return 'Cash on delivery';
    if (order.paymentMethod === 'international-bank-transfer') return 'Bank transfer (legacy)';
    return 'Paymob';
  }

  canConfirmCod(order: OrderDoc): boolean {
    return order.paymentMethod === 'cash-on-delivery' && order.status === 'pending';
  }

  async confirmCod(order: OrderDoc): Promise<void> {
    if (!this.canConfirmCod(order) || this.confirmingOrderId()) return;
    this.confirmingOrderId.set(order.id);
    try {
      await this.#ordersAdmin.confirmCodOrder(order.id);
      this.#snackbar.success('Order confirmed. Stock updated.');
      this.pendingResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(orderActionError(error));
    } finally {
      this.confirmingOrderId.set(null);
    }
  }
}
