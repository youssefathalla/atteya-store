import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { changeOrderStatus } from './order-status-change.js';

export interface ConfirmCodOrderResponse {
  readonly orderId: string;
  readonly status: 'confirmed';
  /** True when this call performed the pending → confirmed transition and stock write. */
  readonly stockDecremented: boolean;
}

/**
 * Admin confirmation for Egypt orders paid outside Paymob:
 * - cash on delivery: the shipping fee was received (or shipping is free);
 * - InstaPay: the full transfer was seen in the bank app.
 * Kept (under its original name, so deploys never delete or rename a live function) as a thin
 * wrapper over `changeOrderStatus`, the same code the status dropdown (`setOrderStatus`) uses:
 * pending → confirmed only, idempotent when already confirmed, stock taken once.
 */
export const confirmCodOrder = onCall(
  adminCallableOptions(),
  async (request): Promise<ConfirmCodOrderResponse> => {
    const actor = await requireRole(request, 'admin');
    const orderId = parseOrderId(request.data);
    const result = await changeOrderStatus(getFirestore(), orderId, 'confirmed', actor, {
      idempotent: true,
      onlyFrom: ['pending'],
      onlyFromMessage: 'Only open Cash on Delivery or InstaPay orders can be confirmed.',
    });
    return { orderId, status: 'confirmed', stockDecremented: result.stock === 'take' };
  },
);

function parseOrderId(raw: unknown): string {
  const orderId =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)['orderId']
      : undefined;
  if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 200 || orderId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Choose an order to confirm.');
  }
  return orderId;
}
