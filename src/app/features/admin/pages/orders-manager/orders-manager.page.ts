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
import { SharedIconModule } from '@shared/ui/mat-icon';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';
import { OrdersAdminService } from './services/orders-admin.service';

@Component({
  selector: 'app-orders-manager-page',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule],
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent {
  readonly #firestore = injectFirestore();
  readonly #orders = inject(OrdersAdminService);
  readonly #snackbar = inject(SnackbarService);

  readonly confirmingId = signal<string | null>(null);

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

  async confirm(order: OrderDoc): Promise<void> {
    if (this.confirmingId()) return;
    this.confirmingId.set(order.id);
    try {
      await this.#orders.confirmInternationalPayment(order.id);
      this.#snackbar.success('Payment confirmed.');
      this.pendingResource.reload();
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'We could not confirm this payment.';
      this.#snackbar.error(message);
    } finally {
      this.confirmingId.set(null);
    }
  }
}
