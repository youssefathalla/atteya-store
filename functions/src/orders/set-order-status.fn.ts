import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { changeOrderStatus, type OrderStatusChangeResult } from './order-status-change.js';
import { parseSetOrderStatusRequest } from '../store/order-status.js';

/**
 * Admin status dropdown: move an order to Waiting for Payment, Confirmed, Shipped, Delivered or
 * Cancelled. The move is checked on the server against the live order (`allowedStatusMoves`), and
 * stock, offer uses, stamps and `statusHistory` change in the same transaction
 * (`changeOrderStatus`).
 */
export const setOrderStatus = onCall(
  adminCallableOptions(),
  async (request): Promise<OrderStatusChangeResult> => {
    const actor = await requireRole(request, 'admin');
    const parsed = parseSetOrderStatusRequest(request.data);
    if (!parsed) {
      throw new HttpsError(
        'invalid-argument',
        'Choose an order and a status. A reason can be up to 300 characters.',
      );
    }
    return changeOrderStatus(getFirestore(), parsed.orderId, parsed.status, actor, {
      reason: parsed.reason,
    });
  },
);
