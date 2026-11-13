import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { RequiredCaller } from '../auth/require-role.js';
import {
  isReturnStatus,
  nextReturnStatuses,
  returnStatusLabel,
  withReturnStatus,
  type ReturnStatus,
  type StockStep,
} from '../store/returns.js';
import { RETURN_REQUESTS_COLLECTION } from './return-access.js';
import {
  applyStockMoves,
  approveStep,
  mergeItemChoices,
  productIdsOf,
  readSavedStep,
  readStaffItems,
  receiveStep,
  rejectUndoStep,
  ReturnStepError,
  savedStep,
  sentProductIds,
  withSentPieces,
  type ApproveInput,
  type ReceiveInput,
  type RefundSentInput,
  type RejectInput,
  type StaffReturnItem,
  type StepProduct,
} from './return-staff-step.js';

/**
 * `returnStaffNotes/{requestId}`: who moved the request and when (`history`), staff only. Kept off
 * the request's shopper-facing fields and off the order the shopper can read.
 */
export const RETURN_STAFF_NOTES_COLLECTION = 'returnStaffNotes';

export type ReturnStepCall =
  | { readonly step: 'approve'; readonly input: ApproveInput }
  | { readonly step: 'reject'; readonly input: RejectInput }
  | { readonly step: 'receive'; readonly input: ReceiveInput }
  | { readonly step: 'refund-sent'; readonly input: RefundSentInput };

export interface ReturnStepResult {
  readonly requestId: string;
  readonly status: ReturnStatus;
  /** False when the request was already in that status (nothing written). */
  readonly changed: boolean;
  /** Pieces that couldn't go back into stock (the product or its size is gone). */
  readonly notReturned: number;
}

const TARGET: Record<ReturnStepCall['step'], ReturnStatus> = {
  approve: 'approved',
  reject: 'rejected',
  receive: 'received',
  'refund-sent': 'refund-sent',
};

/**
 * One staff step on a return or exchange request, in a transaction against the live request,
 * order and products (ATS-293). Checks the move (`nextReturnStatuses`), moves stock exactly once
 * per step (`stockTakenAt` at Approve, `stockUndoneAt` on Reject after Approve, `stockReturnedAt`
 * at Item Received), stamps `approvedAt` / `rejectedAt` / `receivedAt` / `refundSentAt`, updates
 * the order's `returns` summary and appends the history row to `returnStaffNotes/{id}`. Pressing
 * twice, or two staff at once, finds the request already moved and answers `changed: false`.
 */
export async function runReturnStep(
  db: Firestore,
  call: ReturnStepCall,
  actor: RequiredCaller,
): Promise<ReturnStepResult> {
  const requestId = call.input.requestId;
  const target = TARGET[call.step];
  const requestRef = db.collection(RETURN_REQUESTS_COLLECTION).doc(requestId);

  try {
    return await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      const saved = requestSnap.data();
      const orderId = saved?.['orderId'];
      if (!requestSnap.exists || !saved || typeof orderId !== 'string' || !orderId || orderId.includes('/')) {
        throw new ReturnStepError(
          'not-found',
          "We couldn't find that request. Refresh the list and try again.",
        );
      }
      const current = saved['status'];
      if (!isReturnStatus(current)) {
        throw new ReturnStepError('failed-precondition', "This request's status can't be changed here.");
      }
      if (current === target) {
        return { requestId, status: target, changed: false, notReturned: 0 };
      }
      const hasRefund = saved['hasRefund'] === true;
      if (!nextReturnStatuses(current, hasRefund).includes(target)) {
        throw new ReturnStepError('failed-precondition', moveRefusal(current, target, hasRefund));
      }

      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await tx.get(orderRef);
      const order = orderSnap.data();

      const rawItems: unknown[] = Array.isArray(saved['items']) ? saved['items'] : [];
      // Reject and Refund Sent never read the items, so one unreadable item can't block them.
      let items: StaffReturnItem[] =
        call.step === 'approve' || call.step === 'receive' ? readStaffItems(rawItems) : [];
      let step: StockStep | null = null;
      let short: 'refuse' | 'floor' = 'floor';
      const patch: DocumentData = {};
      const now = FieldValue.serverTimestamp();

      // Every read first (Firestore transactions read before they write).
      const products = new Map<string, StepProduct | null>();
      const readProducts = async (ids: readonly string[]) => {
        const missing = ids.filter((id) => !products.has(id));
        const snaps = await Promise.all(missing.map((id) => tx.get(productRef(db, id))));
        missing.forEach((id, index) => {
          const snap = snaps[index]!;
          products.set(id, snap.exists ? stepProduct(snap.data() ?? {}) : null);
        });
      };

      if (call.step === 'approve') {
        const ids = new Set<string>(sentProductIds(call.input.sent));
        for (const item of items) {
          ids.add(item.productId);
          if (item.newProductId) ids.add(item.newProductId);
          if (item.sentProductId) ids.add(item.sentProductId);
        }
        await readProducts([...ids]);
        items = withSentPieces(items, call.input.sent, products);
        if (!saved['stockTakenAt']) {
          step = approveStep(items);
          short = 'refuse';
          patch['stockTakenAt'] = now;
        }
        patch['items'] = mergeItemChoices(rawItems, items);
        patch['approvedAt'] = now;
        patch['approvedBy'] = actor.uid;
      } else if (call.step === 'reject') {
        if (saved['stockTakenAt'] && !saved['stockUndoneAt']) {
          step = rejectUndoStep(readSavedStep(saved['approveStock']));
          await readProducts(productIdsOf(step));
          patch['stockUndoneAt'] = now;
        }
        patch['rejectReason'] = call.input.reason;
        patch['rejectedAt'] = now;
        patch['rejectedBy'] = actor.uid;
      } else if (call.step === 'receive') {
        const received = receiveStep(items, call.input.sellable);
        items = received.items;
        if (!saved['stockReturnedAt']) {
          step = received.step;
          await readProducts(productIdsOf(step));
          patch['stockReturnedAt'] = now;
        }
        patch['items'] = mergeItemChoices(rawItems, items);
        patch['receivedAt'] = now;
        patch['receivedBy'] = actor.uid;
      } else {
        const itemsEgp = typeof saved['itemsEgp'] === 'number' ? saved['itemsEgp'] : 0;
        const refundEgp = typeof saved['refundEgp'] === 'number' ? saved['refundEgp'] : null;
        // Nothing to send (the courier fee was at least the items): close it with EGP 0.
        const nothingToSend = refundEgp !== null && refundEgp <= 0;
        if (call.input.amountEgp < 1 && !nothingToSend) {
          throw new ReturnStepError('invalid-argument', 'Write the amount you sent, in whole pounds.');
        }
        if (call.input.amountEgp > itemsEgp && call.input.amountEgp > 0) {
          throw new ReturnStepError(
            'invalid-argument',
            `That is more than the refunded items cost (EGP ${itemsEgp.toLocaleString('en-US')}). Check the amount.`,
          );
        }
        patch['refundSentEgp'] = call.input.amountEgp;
        patch['refundReference'] = call.input.reference;
        patch['refundSentAt'] = now;
        patch['refundSentBy'] = actor.uid;
      }

      // Writes from here on.
      let notReturned = 0;
      if (step) {
        const moved = applyStockMoves(products, step, { short });
        notReturned = moved.notReturned;
        for (const [productId, next] of moved.next) {
          tx.update(productRef(db, productId), {
            stock: next.stock,
            inStock: next.inStock,
            stockBySize: next.stockBySize ?? FieldValue.delete(),
            updatedAt: now,
            updatedBy: actor.uid,
          });
        }
        // Approve saves only what really moved, so Reject never undoes a piece that was skipped.
        if (call.step === 'approve') patch['approveStock'] = savedStep(moved.applied);
        const before = typeof saved['stockNotReturned'] === 'number' ? saved['stockNotReturned'] : 0;
        if (notReturned > 0) patch['stockNotReturned'] = before + notReturned;
        if (notReturned > 0) {
          console.warn('Return stock could not all go back', { requestId, notReturned });
        }
      }

      tx.update(requestRef, { ...patch, status: target, updatedAt: now });
      if (orderSnap.exists && order) {
        tx.update(orderRef, {
          returns: withReturnStatus(
            order['returns'],
            requestId,
            target,
            call.step === 'reject'
              ? { rejectReason: call.input.reason }
              : call.step === 'refund-sent'
                ? { refundSentEgp: call.input.amountEgp }
                : {},
          ),
        });
      }
      tx.set(
        db.collection(RETURN_STAFF_NOTES_COLLECTION).doc(requestId),
        {
          history: FieldValue.arrayUnion({
            status: target,
            from: current,
            at: Timestamp.now(),
            by: actor.uid,
            ...(actor.email ? { byEmail: actor.email } : {}),
            ...(call.step === 'reject' ? { reason: call.input.reason } : {}),
          }),
          updatedAt: now,
        },
        { merge: true },
      );
      return { requestId, status: target, changed: true, notReturned };
    });
  } catch (error: unknown) {
    if (error instanceof ReturnStepError) throw new HttpsError(error.code, error.message);
    throw error;
  }
}

function productRef(db: Firestore, productId: string): DocumentReference {
  return db.collection('products').doc(productId);
}

function stepProduct(data: DocumentData): StepProduct {
  return {
    stock: data['stock'],
    stockBySize: data['stockBySize'],
    options: data['options'],
    name: typeof data['name'] === 'string' ? data['name'] : '',
  };
}

function moveRefusal(current: ReturnStatus, target: ReturnStatus, hasRefund: boolean): string {
  if (target === 'refund-sent' && !hasRefund) return 'This request has no refund to send.';
  if (current === 'rejected' || current === 'cancelled' || current === 'refund-sent') {
    return `This request is ${returnStatusLabel(current)}, so it can't change any more.`;
  }
  return `A request that is ${returnStatusLabel(current)} can't be marked as ${returnStatusLabel(target)}. Refresh the page and try again.`;
}
