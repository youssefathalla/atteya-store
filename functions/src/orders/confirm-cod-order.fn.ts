import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { isDeliveryFeeToBeAgreed } from '../store/order-messages.js';
import {
  aggregateOrderStockDemand,
  nextStockAfterDemand,
  parseOrderStockLines,
} from './decrement-order-stock.js';

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
 * Decrements product stock atomically (per size when present). The callable keeps its
 * original name so deploys never delete or rename a live function.
 */
export const confirmCodOrder = onCall(
  adminCallableOptions(),
  async (request): Promise<ConfirmCodOrderResponse> => {
    const actor = await requireRole(request, 'admin');
    const orderId = parseOrderId(request.data);
    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);

    return db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', 'That order could not be found.');
      }
      const order = orderSnap.data() ?? {};
      assertConfirmableCodOrder(order);

      if (order['status'] === 'confirmed') {
        // Idempotent: already confirmed (and stock already taken on first confirm).
        return { orderId, status: 'confirmed' as const, stockDecremented: false };
      }
      if (order['status'] !== 'pending') {
        throw new HttpsError(
          'failed-precondition',
          'Only open Cash on Delivery or InstaPay orders can be confirmed.',
        );
      }

      const lines = parseOrderStockLines(order);
      const demandByProduct = aggregateOrderStockDemand(lines);
      const productIds = [...demandByProduct.keys()];
      const productRefs = productIds.map((id) => db.collection('products').doc(id));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      const now = FieldValue.serverTimestamp();
      for (let i = 0; i < productIds.length; i++) {
        const productId = productIds[i]!;
        const snap = productSnaps[i]!;
        if (!snap.exists) {
          throw new HttpsError(
            'failed-precondition',
            'One product on this order no longer exists. Stock cannot be updated.',
          );
        }
        const data = snap.data() ?? {};
        const demand = demandByProduct.get(productId)!;
        const next = nextStockAfterDemand(
          {
            stock: data['stock'],
            stockBySize: data['stockBySize'],
            options: data['options'],
          },
          demand,
        );
        const patch: DocumentData = {
          stock: next.stock,
          inStock: next.inStock,
          updatedAt: now,
          updatedBy: actor.uid,
        };
        if (next.stockBySize) {
          patch['stockBySize'] = next.stockBySize;
        } else {
          patch['stockBySize'] = FieldValue.delete();
        }
        tx.update(productRefs[i]!, patch);
      }

      tx.update(orderRef, {
        status: 'confirmed',
        confirmedAt: now,
        confirmedBy: actor.uid,
        updatedAt: now,
      });

      return { orderId, status: 'confirmed' as const, stockDecremented: true };
    });
  },
);

function parseOrderId(raw: unknown): string {
  if (!isRecord(raw)) {
    throw new HttpsError('invalid-argument', 'Choose an order to confirm.');
  }
  const orderId = raw['orderId'];
  if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 200 || orderId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Choose an order to confirm.');
  }
  return orderId;
}

function assertConfirmableCodOrder(order: DocumentData): void {
  const method = order['paymentMethod'];
  if (method !== 'cash-on-delivery' && method !== 'instapay') {
    throw new HttpsError(
      'failed-precondition',
      'Only Cash on Delivery and InstaPay orders are confirmed here. Card or Wallet payments confirm on their own.',
    );
  }
  const shipping = isRecord(order['shipping']) ? order['shipping'] : null;
  const country = shipping && typeof shipping['country'] === 'string' ? shipping['country'] : '';
  const fulfilment =
    isRecord(order['pricing']) && typeof order['pricing']['fulfilment'] === 'string'
      ? order['pricing']['fulfilment']
      : '';
  if (country !== 'EG' && fulfilment !== 'domestic-cod' && fulfilment !== 'domestic-instapay') {
    throw new HttpsError('failed-precondition', 'Only Egypt orders are confirmed here.');
  }
  const pricing = isRecord(order['pricing']) ? order['pricing'] : null;
  if (order['status'] === 'pending' && isDeliveryFeeToBeAgreed(pricing?.['shipping'])) {
    throw new HttpsError(
      'failed-precondition',
      'Set the delivery fee you agreed with the customer before confirming this order.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
