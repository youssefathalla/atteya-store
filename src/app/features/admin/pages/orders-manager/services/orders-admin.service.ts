import { Service } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import * as v from 'valibot';
import type { StaffOrderStatus } from '@core/config/order-status';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import {
  ORDER_STAFF_NOTES_COLLECTION,
  OrderSchema,
  ORDERS_COLLECTION,
  OrderStaffNotesSchema,
  type OrderDoc,
  type OrderStaffNotes,
} from '@core/services/orders/order.schema';
import { PRODUCTS_COLLECTION } from '@core/services/products/product.constants';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type { OrderListQuery, ProductStockLookup } from '../models/order-admin.model';
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

export const ORDERS_PAGE_SIZE = 50;
const PRODUCT_LOOKUP_CHUNK = 20;

/** One batch of the admin Orders list (ATS-286). */
export interface OrdersBatch {
  readonly orders: readonly OrderDoc[];
  /** Where the next batch starts; null when this batch came back short (no more orders). */
  readonly next: QueryDocumentSnapshot<OrderDoc> | null;
}

export interface SetOrderStatusResult {
  readonly orderId: string;
  readonly status: StaffOrderStatus;
  readonly changed: boolean;
  readonly stock: 'take' | 'return' | 'none';
  /** Pieces that couldn't go back into stock (size or product gone). */
  readonly notReturned?: number;
}

export interface SetDeliveryFeeResult {
  readonly orderId: string;
  readonly feeEgp: number;
  readonly totalEgp: number;
}

@Service()
export class OrdersAdminService {
  readonly #firestore = injectFirestore();
  readonly #functions = injectFunctionsAsync();

  /**
   * Up to `size` orders (`ORDERS_PAGE_SIZE` per Show More Orders batch), starting after `after` when
   * given. With no search and no dates: last changed first. With a search word (`searchTokens`,
   * ATS-256) or dates (`createdAt`, whole days): newest placed first.
   */
  async listOrders(
    filter: OrderListQuery,
    after: QueryDocumentSnapshot<OrderDoc> | null = null,
    size: number = ORDERS_PAGE_SIZE,
  ): Promise<OrdersBatch> {
    const ordersCol = collection(this.#firestore, ORDERS_COLLECTION).withConverter(
      createValibotConverter(OrderSchema),
    );

    const constraints: QueryConstraint[] = [];
    if (filter.status !== 'all') constraints.push(where('status', '==', filter.status));
    if (filter.term) constraints.push(where('searchTokens', 'array-contains', filter.term));
    if (filter.placed) {
      constraints.push(
        where('createdAt', '>=', Timestamp.fromDate(filter.placed.start)),
        where('createdAt', '<', Timestamp.fromDate(filter.placed.end)),
      );
    }
    const byPlaced = filter.term !== null || filter.placed !== null;
    constraints.push(orderBy(byPlaced ? 'createdAt' : 'updatedAt', 'desc'));
    if (after) constraints.push(startAfter(after));
    constraints.push(limit(size));

    const snap = await getDocs(query(ordersCol, ...constraints));
    const docs = snap.docs;
    return {
      orders: docs.map((item) => item.data()),
      next: docs.length === size ? (docs[docs.length - 1] ?? null) : null,
    };
  }

  /** One order by id for the tracking page; null when it doesn't exist. */
  async getOrder(orderId: string): Promise<OrderDoc | null> {
    const snap = await getDoc(
      doc(this.#firestore, ORDERS_COLLECTION, orderId).withConverter(createValibotConverter(OrderSchema)),
    );
    return snap.exists() ? snap.data() : null;
  }

  /**
   * Current catalogue stock for the product ids on the loaded orders.
   * Reads live `stock` / `stockBySize` from product docs (not the order pricing snapshot).
   */
  async loadProductStock(orders: readonly OrderDoc[]): Promise<ReadonlyMap<string, ProductStockLookup>> {
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
   * Staff-only notes (status history, cancel reason) for the loaded orders, from
   * `orderStaffNotes/{orderId}`. A missing or unreadable doc just means no notes.
   */
  async loadStaffNotes(orders: readonly OrderDoc[]): Promise<ReadonlyMap<string, OrderStaffNotes>> {
    const byId = new Map<string, OrderStaffNotes>();
    for (let i = 0; i < orders.length; i += PRODUCT_LOOKUP_CHUNK) {
      const chunk = orders.slice(i, i + PRODUCT_LOOKUP_CHUNK);
      const snaps = await Promise.all(
        chunk.map((order) => getDoc(doc(this.#firestore, ORDER_STAFF_NOTES_COLLECTION, order.id))),
      );
      for (const snap of snaps) {
        if (!snap.exists()) continue;
        const parsed = v.safeParse(OrderStaffNotesSchema, snap.data());
        if (parsed.success) byId.set(snap.id, parsed.output);
      }
    }
    return byId;
  }

  /**
   * Move an order in the status dropdown. The server checks the move against the live order and
   * takes or returns stock in the same transaction. `reason` is only kept for Cancelled.
   */
  async setOrderStatus(
    orderId: string,
    status: StaffOrderStatus,
    reason: string | null = null,
  ): Promise<SetOrderStatusResult> {
    const call = await callableFrom<
      { orderId: string; status: StaffOrderStatus; reason: string | null },
      SetOrderStatusResult
    >(this.#functions(), 'setOrderStatus');
    const response = await call({ orderId, status, reason });
    return response.data;
  }

  /** Save the delivery fee agreed on WhatsApp for a large Egypt order (open orders only). */
  async setDeliveryFee(orderId: string, feeEgp: number): Promise<SetDeliveryFeeResult> {
    const call = await callableFrom<{ orderId: string; feeEgp: number }, SetDeliveryFeeResult>(
      this.#functions(),
      'setDeliveryFee',
    );
    const response = await call({ orderId, feeEgp });
    return response.data;
  }

  /** Admin only: deletes a Cancelled or Payment Failed order (the server checks both). */
  async deleteOrder(orderId: string): Promise<void> {
    const call = await callableFrom<{ orderId: string }, unknown>(this.#functions(), 'deleteOrder');
    await call({ orderId });
  }
}
