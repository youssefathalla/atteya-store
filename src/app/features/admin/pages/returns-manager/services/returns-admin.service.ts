import { Service } from '@angular/core';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import * as v from 'valibot';
import { callableFrom, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { PRODUCTS_COLLECTION } from '@core/services/products/product.constants';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import {
  RETURN_REQUESTS_COLLECTION,
  RETURN_STAFF_NOTES_COLLECTION,
  ReturnRequestSchema,
  ReturnStaffNotesSchema,
  type ReturnProductLookup,
  type ReturnRequestDoc,
  type ReturnStaffNotes,
  type ReturnStatusFilter,
  type ReturnStepResult,
} from '../models/return-admin.model';

export const RETURNS_PAGE_SIZE = 20;
/** Requests one order can ever have (`RETURN_REQUESTS_PER_ORDER_MAX`). */
const REQUESTS_PER_ORDER = 10;

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));

/** Lean parse of a product doc: the name, live counts and size names. */
const ProductLookupSchema = v.object({
  name: v.optional(v.string(), ''),
  stock: v.optional(v.nullable(wholeNumber), null),
  stockBySize: v.optional(v.nullable(v.record(v.string(), wholeNumber)), null),
  options: v.optional(
    v.array(
      v.object({
        key: v.string(),
        values: v.optional(v.array(v.object({ id: v.string(), label: v.optional(v.string(), '') })), []),
      }),
    ),
    [],
  ),
});

/** One batch of the Returns list. */
export interface ReturnsBatch {
  readonly requests: readonly ReturnRequestDoc[];
  /** Where the next batch starts; null when this batch came back short. */
  readonly next: QueryDocumentSnapshot<ReturnRequestDoc> | null;
}

/** One Wrong Item Sent choice: the item on the request and the piece we actually sent. */
export interface SentPieceChoice {
  readonly itemIndex: number;
  readonly productId: string;
  readonly size: string | null;
}

/** Admin Returns (ATS-293): reads requests and runs the four step callables. */
@Service()
export class ReturnsAdminService {
  readonly #firestore = injectFirestore();
  readonly #functions = injectFunctionsAsync();
  readonly #converter = createValibotConverter(ReturnRequestSchema);

  /** Newest first, `RETURNS_PAGE_SIZE` per Show More Requests batch. */
  async listRequests(
    status: ReturnStatusFilter,
    after: QueryDocumentSnapshot<ReturnRequestDoc> | null = null,
    size: number = RETURNS_PAGE_SIZE,
  ): Promise<ReturnsBatch> {
    const col = collection(this.#firestore, RETURN_REQUESTS_COLLECTION).withConverter(this.#converter);
    const constraints: QueryConstraint[] = [];
    if (status !== 'all') constraints.push(where('status', '==', status));
    constraints.push(orderBy('createdAt', 'desc'));
    if (after) constraints.push(startAfter(after));
    constraints.push(limit(size));
    const snap = await getDocs(query(col, ...constraints));
    const docs = snap.docs;
    return {
      requests: docs.map((item) => item.data()),
      next: docs.length === size ? (docs[docs.length - 1] ?? null) : null,
    };
  }

  /** How many requests wait for Approve or Reject (the admin menu count). */
  async countRequested(): Promise<number> {
    const col = collection(this.#firestore, RETURN_REQUESTS_COLLECTION);
    const snap = await getCountFromServer(query(col, where('status', '==', 'requested')));
    return snap.data().count;
  }

  async getRequest(requestId: string): Promise<ReturnRequestDoc | null> {
    const snap = await getDoc(
      doc(this.#firestore, RETURN_REQUESTS_COLLECTION, requestId).withConverter(this.#converter),
    );
    return snap.exists() ? snap.data() : null;
  }

  /** Every request of one order (at most 10), newest first. */
  async requestsForOrder(orderId: string): Promise<readonly ReturnRequestDoc[]> {
    const col = collection(this.#firestore, RETURN_REQUESTS_COLLECTION).withConverter(this.#converter);
    const snap = await getDocs(query(col, where('orderId', '==', orderId), limit(REQUESTS_PER_ORDER)));
    return snap.docs.map((item) => item.data()).sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  }

  /** The staff-only history; a missing doc means nothing happened yet. */
  async getStaffNotes(requestId: string): Promise<ReturnStaffNotes | null> {
    const snap = await getDoc(doc(this.#firestore, RETURN_STAFF_NOTES_COLLECTION, requestId));
    if (!snap.exists()) return null;
    const parsed = v.safeParse(ReturnStaffNotesSchema, snap.data());
    return parsed.success ? parsed.output : null;
  }

  /** Live stock for the products a request touches; a missing product is left out. */
  async loadProducts(ids: readonly string[]): Promise<ReadonlyMap<string, ReturnProductLookup>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const snaps = await Promise.all(
      unique.map((id) => getDoc(doc(this.#firestore, PRODUCTS_COLLECTION, id))),
    );
    const byId = new Map<string, ReturnProductLookup>();
    for (const snap of snaps) {
      if (!snap.exists()) continue;
      const parsed = v.safeParse(ProductLookupSchema, snap.data());
      if (!parsed.success) continue;
      const sizeOption = parsed.output.options.find((option) => option.key === 'size');
      byId.set(snap.id, {
        id: snap.id,
        name: parsed.output.name,
        stock: parsed.output.stock,
        stockBySize: parsed.output.stockBySize,
        sizes: (sizeOption?.values ?? []).map((value) => ({ id: value.id, label: value.label || value.id })),
      });
    }
    return byId;
  }

  approve(requestId: string, sent: readonly SentPieceChoice[]): Promise<ReturnStepResult> {
    return this.#step('approveReturnRequest', { requestId, sent });
  }

  reject(requestId: string, reason: string): Promise<ReturnStepResult> {
    return this.#step('rejectReturnRequest', { requestId, reason });
  }

  receive(
    requestId: string,
    sellable: readonly { readonly itemIndex: number; readonly canBeSoldAgain: boolean }[],
  ): Promise<ReturnStepResult> {
    return this.#step('receiveReturnRequest', { requestId, sellable });
  }

  /** Admin only (the server checks the role too). */
  refundSent(requestId: string, amountEgp: number, reference: string | null): Promise<ReturnStepResult> {
    return this.#step('markRefundSent', { requestId, amountEgp, reference });
  }

  async #step(name: string, payload: object): Promise<ReturnStepResult> {
    const call = await callableFrom<object, ReturnStepResult>(this.#functions(), name);
    const response = await call(payload);
    return response.data;
  }
}

function millis(raw: unknown): number {
  if (raw && typeof raw === 'object' && 'toMillis' in raw && typeof raw.toMillis === 'function') {
    return Number(raw.toMillis());
  }
  if (raw instanceof Date) return raw.getTime();
  return 0;
}
