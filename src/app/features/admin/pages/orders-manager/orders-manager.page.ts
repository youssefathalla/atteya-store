import { Component, resource } from '@angular/core';
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
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';

@Component({
  selector: 'app-orders-manager-page',
  host: { class: 'block w-full' },
  templateUrl: './orders-manager.page.html',
})
export class OrdersManagerPageComponent {
  readonly #firestore = injectFirestore();

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
    return order.paymentMethod === 'cash-on-delivery' ? 'Cash on delivery' : 'Paymob';
  }
}
