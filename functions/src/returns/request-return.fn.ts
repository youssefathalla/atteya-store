import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions, requireAppCheck } from '../auth/callable-options.js';
import { parseCheckoutShippingConfig, SHIPPING_DOC_PATH } from '../shipping/shipping-settings.js';
import { normalBoxFeeEgp as normalBoxFee } from '../store/returns.js';
import { isOrderShopper, RETURN_REQUESTS_COLLECTION } from './return-access.js';
import {
  buildReturnRequest,
  returnSummaryEntry,
  parseRequestReturn,
  productIdsFor,
  ReturnRequestError,
} from './return-request.js';

export interface RequestReturnResponse {
  readonly requestId: string;
  /** `#R-A1B2C3`. */
  readonly ref: string;
}

const NOT_FOUND = "We couldn't find that order. Check the link in your order email.";

/**
 * A shopper sends a return or exchange request for a Delivered order (ATS-291). The signed-in
 * owner is matched by uid, a guest by the order's `viewKey`. Every rule (window, open request,
 * pieces left, kinds, gifts, money) is in `buildReturnRequest()` and `../store/returns.ts`.
 * Saves `returnRequests/{id}` and appends the order's `returns` summary in one transaction; the
 * `sendReturnEmails` trigger then sends the staff alert and the shopper's "Request Sent" email.
 */
export const requestReturn = onCall(
  adminCallableOptions(),
  async (request): Promise<RequestReturnResponse> => {
    requireAppCheck(request);
    const input = run(() => parseRequestReturn(request.data));

    const db = getFirestore();
    const orderRef = db.collection('orders').doc(input.orderId);
    const requestRef = db.collection(RETURN_REQUESTS_COLLECTION).doc();

    const built = await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const order = orderSnap.data();
      if (!orderSnap.exists || !order || !isOrderShopper(order, request, input.viewKey)) {
        throw new HttpsError('not-found', NOT_FOUND);
      }
      const ids = productIdsFor(order, input);
      const productSnaps = ids.length
        ? await tx.getAll(...ids.map((id) => db.collection('products').doc(id)))
        : [];
      const products = new Map(productSnaps.map((snap) => [snap.id, snap.exists ? snap.data() : undefined]));
      const pricing = isRecord(order['pricing']) ? order['pricing'] : {};
      const shipping = isRecord(pricing['shipping']) ? pricing['shipping'] : {};
      // The box's normal price is only needed when the order's own delivery fee was 0.
      const orderFee = shipping['priceEgp'];
      let normalBoxFeeEgp = 0;
      if (!(typeof orderFee === 'number' && orderFee > 0)) {
        const shippingSnap = await tx.get(db.doc(SHIPPING_DOC_PATH));
        normalBoxFeeEgp = normalBoxFee(
          parseCheckoutShippingConfig(shippingSnap.data()).settings,
          shipping['boxId'],
        );
      }

      const result = run(() =>
        buildReturnRequest({
          requestId: requestRef.id,
          orderId: input.orderId,
          order,
          input,
          products,
          normalBoxFeeEgp,
          nowMs: Date.now(),
        }),
      );

      const now = FieldValue.serverTimestamp();
      tx.create(requestRef, {
        ref: result.ref,
        orderId: result.orderId,
        orderRef: result.orderRef,
        status: 'requested',
        customerId: result.customer.customerId,
        guest: result.customer.guest,
        customerEmail: result.customer.email,
        customer: result.customer,
        items: result.items,
        note: result.note,
        refundTo: result.refundTo,
        hasRefund: result.hasRefund,
        storeFault: result.storeFault,
        itemsEgp: result.itemsEgp,
        feeEgp: result.feeEgp,
        feePaid: result.feePaid,
        refundEgp: result.refundEgp,
        cashAtDoorEgp: result.cashAtDoorEgp,
        orderDeliveredAt: result.deliveredAtMs === null ? null : Timestamp.fromMillis(result.deliveredAtMs),
        createdAt: now,
        updatedAt: now,
      });
      // Arrays can't hold server time stamps, so the summary carries the transaction's clock.
      // Only what the shopper may see: never `refundTo`, the staff history or staff notes.
      tx.update(orderRef, {
        returns: FieldValue.arrayUnion({
          ...returnSummaryEntry(requestRef.id, result),
          createdAt: Timestamp.now(),
        }),
      });
      return result;
    });

    return { requestId: requestRef.id, ref: built.ref };
  },
);

/** Runs a pure step and turns its `ReturnRequestError` into an HttpsError with the same message. */
function run<T>(step: () => T): T {
  try {
    return step();
  } catch (error: unknown) {
    if (error instanceof ReturnRequestError) throw new HttpsError(error.code, error.message);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
