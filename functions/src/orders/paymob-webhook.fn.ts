import { createHash } from 'node:crypto';
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { verifyPaymobHmac } from '../paymob/hmac.js';
import { PAYMOB_HMAC_SECRET, paymobSecrets } from '../paymob/paymob-config.js';
import type { StockFields } from '../products/stock.js';
import {
  aggregateOrderStockDemand,
  applyStockDemand,
  parseOrderStockLines,
} from './decrement-order-stock.js';

/**
 * Paymob Transaction Processed callback (notification_url).
 * Only a verified Paymob HMAC callback may move paymob orders from
 * pending → confirmed / failed (server-authoritative, like admin confirms).
 */
export const paymobWebhook = onRequest(
  {
    region: 'europe-west3',
    cors: false,
    secrets: [...paymobSecrets()],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const hmac =
      typeof req.query['hmac'] === 'string'
        ? req.query['hmac']
        : Array.isArray(req.query['hmac'])
          ? String(req.query['hmac'][0] ?? '')
          : '';

    const body = req.body;
    const obj =
      body && typeof body === 'object' && body['obj'] && typeof body['obj'] === 'object'
        ? (body['obj'] as Record<string, unknown>)
        : null;

    if (!obj) {
      res.status(400).send('Bad Request');
      return;
    }

    const secret = PAYMOB_HMAC_SECRET.value().trim();
    if (!secret || !verifyPaymobHmac(obj, hmac, secret)) {
      console.warn('Paymob webhook HMAC mismatch');
      res.status(401).send('Unauthorized');
      return;
    }

    const success = readPaymobFlag(obj['success']);
    const pending = readPaymobFlag(obj['pending']);
    // HMAC-covered flags — voids/refunds/errors can still report success:true.
    const isVoided = readPaymobFlag(obj['is_voided']);
    const isRefunded = readPaymobFlag(obj['is_refunded']);
    const errorOccurred = readPaymobFlag(obj['error_occured']);
    const transactionId = typeof obj['id'] === 'number' ? obj['id'] : Number(obj['id']);
    const amountCents =
      typeof obj['amount_cents'] === 'number' ? obj['amount_cents'] : Number(obj['amount_cents']);
    const currency = typeof obj['currency'] === 'string' ? obj['currency'] : '';
    // HMAC covers `order.id` (Paymob order). Merchant order id is unsigned — bind via intention.
    const signedPaymobOrderId = resolveSignedPaymobOrderId(obj);

    const orderId = resolveMerchantOrderId(obj);
    if (!orderId || !Number.isFinite(transactionId) || signedPaymobOrderId === null) {
      res.status(200).send('ignored');
      return;
    }

    // Still pending at the gateway — acknowledge without changing state.
    if (pending) {
      res.status(200).send('pending');
      return;
    }

    // Only a clean capture may confirm. Void/refund/error callbacks must not fulfil.
    const isCleanCapture = success && !isVoided && !isRefunded && !errorOccurred;

    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);
    const eventId = `paymob_txn_${transactionId}`;
    const eventRef = db.collection('paymobWebhookEvents').doc(eventId);

    try {
      await db.runTransaction(async (tx) => {
        const [eventSnap, orderSnap] = await Promise.all([tx.get(eventRef), tx.get(orderRef)]);
        if (eventSnap.exists) {
          return;
        }
        if (!orderSnap.exists) {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'missing-order',
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
        const data = orderSnap.data() ?? {};
        if (data['paymentMethod'] !== 'paymob') {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'wrong-method',
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        const paymob = isRecord(data['paymob']) ? data['paymob'] : {};
        const storedIntentionOrderId =
          typeof paymob['intentionOrderId'] === 'number' ? paymob['intentionOrderId'] : null;
        if (storedIntentionOrderId === null || storedIntentionOrderId !== signedPaymobOrderId) {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'intention-mismatch',
            signedPaymobOrderId,
            storedIntentionOrderId,
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
        const expectedCents = typeof paymob['amountCents'] === 'number' ? paymob['amountCents'] : null;
        // Both sides must be known and equal; a missing amount never confirms.
        if (expectedCents === null || !Number.isFinite(amountCents) || amountCents !== expectedCents) {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'amount-mismatch',
            amountCents: Number.isFinite(amountCents) ? amountCents : null,
            expectedCents,
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
        // Payable currency is always EGP; an empty or other currency never confirms.
        if (currency !== 'EGP') {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'currency-mismatch',
            currency,
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        // Confirmed, shipped, delivered and cancelled are final for Paymob: a late event never
        // re-confirms an order staff already moved on (and never takes stock twice).
        const isFinal =
          data['status'] === 'confirmed' ||
          data['status'] === 'shipped' ||
          data['status'] === 'delivered' ||
          data['status'] === 'cancelled';
        const willConfirm = isCleanCapture && !isFinal;

        // Firestore transactions need every read before any write: load the products
        // whose stock this confirmation takes before writing the event or the order.
        const stockPlan = willConfirm ? await planPaidOrderStock(tx, db, data) : null;

        const now = FieldValue.serverTimestamp();
        tx.set(eventRef, {
          orderId,
          transactionId,
          success,
          isVoided,
          isRefunded,
          errorOccurred,
          isCleanCapture,
          amountCents,
          receivedAt: now,
        });

        if (isFinal) {
          return;
        }

        if (willConfirm && stockPlan) {
          for (const update of stockPlan.updates) {
            const patch: DocumentData = {
              stock: update.next.stock,
              inStock: update.next.inStock,
              stockBySize: update.next.stockBySize ?? FieldValue.delete(),
              updatedAt: now,
              updatedBy: 'paymob-webhook',
            };
            tx.update(update.ref, patch);
          }
          const needsReview = stockPlan.issues.length > 0;
          tx.update(orderRef, {
            status: 'confirmed',
            'paymob.transactionId': transactionId,
            'paymob.paidAt': now,
            confirmedAt: now,
            confirmedBy: 'paymob-webhook',
            stockDecrementedAt: now,
            stockIssues: stockPlan.issues,
            needsReview,
            updatedAt: now,
          });
          if (needsReview) {
            console.warn('Paymob order confirmed with stock issues', {
              orderId,
              issues: stockPlan.issues,
            });
          }
          return;
        }

        // Failed capture, void, refund, or gateway error — do not fulfil.
        if (isVoided || isRefunded || errorOccurred || !success) {
          tx.update(orderRef, {
            status: 'failed',
            'paymob.transactionId': transactionId,
            updatedAt: now,
          });
        }
      });
    } catch (error: unknown) {
      console.error('Paymob webhook processing error', error);
      res.status(500).send('Error');
      return;
    }

    res.status(200).send('ok');
  },
);

export interface PaidOrderStockIssue {
  readonly productId: string;
  readonly reason: 'short' | 'unavailable';
  readonly message: string;
}

interface PaidOrderStockPlan {
  readonly updates: readonly { ref: DocumentReference; next: StockFields }[];
  readonly issues: readonly PaidOrderStockIssue[];
}

/**
 * Work out the stock writes for a paid Paymob order. The money is already taken, so
 * nothing here may stop the confirmation: a count that is too low is floored at 0 and
 * reported as `short`, and a product that can't be updated is reported as `unavailable`.
 * The order is then flagged `needsReview` for an admin.
 */
async function planPaidOrderStock(
  tx: Transaction,
  db: Firestore,
  order: DocumentData,
): Promise<PaidOrderStockPlan> {
  let demandByProduct: ReturnType<typeof aggregateOrderStockDemand>;
  try {
    demandByProduct = aggregateOrderStockDemand(parseOrderStockLines(order));
  } catch (error: unknown) {
    return {
      updates: [],
      issues: [{ productId: '', reason: 'unavailable', message: errorMessage(error) }],
    };
  }

  const productIds = [...demandByProduct.keys()];
  const refs = productIds.map((id) => db.collection('products').doc(id));
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

  const updates: { ref: DocumentReference; next: StockFields }[] = [];
  const issues: PaidOrderStockIssue[] = [];
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i]!;
    const snap = snaps[i]!;
    if (!snap.exists) {
      issues.push({ productId, reason: 'unavailable', message: 'Product no longer exists.' });
      continue;
    }
    const product = snap.data() ?? {};
    try {
      const result = applyStockDemand(
        { stock: product['stock'], stockBySize: product['stockBySize'], options: product['options'] },
        demandByProduct.get(productId)!,
        { allowShortfall: true },
      );
      updates.push({ ref: refs[i]!, next: result.next });
      if (result.short) {
        issues.push({
          productId,
          reason: 'short',
          message: 'Sold more than was in stock. Stock set to 0.',
        });
      }
    } catch (error: unknown) {
      issues.push({ productId, reason: 'unavailable', message: errorMessage(error) });
    }
  }
  return { updates, issues };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Stock could not be updated.';
}

/** Paymob `order.id` is in the HMAC field list — use it to bind payment to our intention. */
function resolveSignedPaymobOrderId(obj: Record<string, unknown>): number | null {
  const order = isRecord(obj['order']) ? obj['order'] : null;
  if (!order) return null;
  const id = typeof order['id'] === 'number' ? order['id'] : Number(order['id']);
  return Number.isFinite(id) ? id : null;
}

function resolveMerchantOrderId(obj: Record<string, unknown>): string | null {
  const order = isRecord(obj['order']) ? obj['order'] : null;
  const merchant =
    (order && typeof order['merchant_order_id'] === 'string' && order['merchant_order_id']) ||
    (typeof obj['merchant_order_id'] === 'string' && obj['merchant_order_id']) ||
    null;
  if (merchant && merchant.length >= 8 && merchant.length <= 80) return merchant;

  // Fallback: some payloads only echo special_reference under claims / extras.
  const claims = isRecord(obj['payment_key_claims']) ? obj['payment_key_claims'] : null;
  const extra =
    claims && typeof claims['extra'] === 'object' && claims['extra']
      ? (claims['extra'] as Record<string, unknown>)
      : null;
  const fromExtra =
    extra && typeof extra['merchant_order_id'] === 'string' ? extra['merchant_order_id'] : null;
  if (fromExtra && fromExtra.length >= 8 && fromExtra.length <= 80) return fromExtra;

  return null;
}

function readPaymobFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable fingerprint for logs without leaking full payloads. */
export function fingerprintPayload(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}
