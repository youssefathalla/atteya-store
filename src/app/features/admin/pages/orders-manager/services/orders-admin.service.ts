import { Service } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import * as v from 'valibot';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { OrderSchema, ORDERS_COLLECTION, type OrderDoc } from '@core/services/orders/order.schema';
import { PRODUCTS_COLLECTION } from '@core/services/products/product.constants';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type { OrderStatusFilter, ProductStockLookup } from '../models/order-admin.model';
import { productIdsFromOrders } from '../utils/order-admin.utils';

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));

/** Admin-only lean parse so stock lookups survive partial product docs. */
const ProductStockLookupSchema = v.object({
  id: v.string(),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  stock: v.optional(wholeNumber),
  stockBySize: v.optional(v.record(v.string(), wholeNumber)),
  options: v.optional(
    v.array(
      v.object({
        key: v.string(),
        label: v.pipe(v.string(), v.trim(), v.minLength(1)),
        values: v.array(
          v.object({
            id: v.string(),
            label: v.pipe(v.string(), v.trim(), v.minLength(1)),
          }),
        ),
      }),
    ),
    () => [],
  ),
});

const ORDERS_PAGE_SIZE = 50;
const PRODUCT_LOOKUP_CHUNK = 20;

export interface CancelOrderResult {
  readonly orderId: string;
  readonly status: 'cancelled';
  readonly changed: boolean;
}

export interface ConfirmCodOrderResult {
  readonly orderId: string;
  readonly status: 'confirmed';
  readonly stockDecremented: boolean;
}

@Service()
export class OrdersAdminService {
  readonly #firestore = injectFirestore();
  readonly #functions = injectFunctionsAsync();

  async listOrders(status: OrderStatusFilter): Promise<readonly OrderDoc[]> {
    const ordersCol = collection(this.#firestore, ORDERS_COLLECTION).withConverter(
      createValibotConverter(OrderSchema),
    );

    const snap =
      status === 'all'
        ? await getDocs(query(ordersCol, orderBy('createdAt', 'desc'), limit(ORDERS_PAGE_SIZE)))
        : await getDocs(
            query(
              ordersCol,
              where('status', '==', status),
              orderBy('createdAt', 'desc'),
              limit(ORDERS_PAGE_SIZE),
            ),
          );

    return snap.docs.map((item) => item.data());
  }

  /**
   * Current catalogue stock for the product ids on the loaded orders.
   * Reads live `stock` / `stockBySize` from product docs (not the order pricing snapshot).
   */
  async loadProductStock(
    orders: readonly OrderDoc[],
  ): Promise<ReadonlyMap<string, ProductStockLookup>> {
    const ids = productIdsFromOrders(orders);
    const byId = new Map<string, ProductStockLookup>();
    if (ids.length === 0) return byId;

    for (let i = 0; i < ids.length; i += PRODUCT_LOOKUP_CHUNK) {
      const chunk = ids.slice(i, i + PRODUCT_LOOKUP_CHUNK);
      const snaps = await Promise.all(
        chunk.map((id) => getDoc(doc(this.#firestore, PRODUCTS_COLLECTION, id))),
      );

      for (const snap of snaps) {
        if (!snap.exists()) continue;
        const parsed = v.safeParse(ProductStockLookupSchema, { ...snap.data(), id: snap.id });
        if (parsed.success) byId.set(snap.id, parsed.output);
      }
    }

    return byId;
  }

  /**
   * Confirm a pending Egypt cash-on-delivery (fee received) or InstaPay (transfer received)
   * order and decrement stock (server transaction).
   */
  async confirmCodOrder(orderId: string): Promise<ConfirmCodOrderResult> {
    const call = await callableFrom<{ orderId: string }, ConfirmCodOrderResult>(
      this.#functions(),
      'confirmCodOrder',
    );
    const response = await call({ orderId });
    return response.data;
  }

  /** Cancel an open cash-on-delivery or InstaPay order that was never paid. */
  async cancelOrder(orderId: string): Promise<CancelOrderResult> {
    const call = await callableFrom<{ orderId: string }, CancelOrderResult>(
      this.#functions(),
      'cancelOrder',
    );
    const response = await call({ orderId });
    return response.data;
  }
}
