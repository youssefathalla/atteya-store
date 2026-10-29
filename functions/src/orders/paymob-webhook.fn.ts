import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { verifyPaymobHmac } from '../paymob/hmac.js';
import { PAYMOB_HMAC_SECRET, paymobSecrets } from '../paymob/paymob-config.js';

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

    const success = obj['success'] === true || obj['success'] === 'true';
    const pending = obj['pending'] === true || obj['pending'] === 'true';
    const transactionId = typeof obj['id'] === 'number' ? obj['id'] : Number(obj['id']);
    const amountCents =
      typeof obj['amount_cents'] === 'number' ? obj['amount_cents'] : Number(obj['amount_cents']);
    const currency = typeof obj['currency'] === 'string' ? obj['currency'] : '';

    const orderId = resolveMerchantOrderId(obj);
    if (!orderId || !Number.isFinite(transactionId)) {
      res.status(200).send('ignored');
      return;
    }

    // Still pending at the gateway — acknowledge without changing state.
    if (pending) {
      res.status(200).send('pending');
      return;
    }

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
        const expectedCents =
          typeof paymob['amountCents'] === 'number' ? paymob['amountCents'] : null;
        if (
          expectedCents !== null &&
          Number.isFinite(amountCents) &&
          amountCents !== expectedCents
        ) {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'amount-mismatch',
            amountCents,
            expectedCents,
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
        if (currency && currency !== 'EGP') {
          tx.set(eventRef, {
            orderId,
            transactionId,
            ignored: 'currency-mismatch',
            currency,
            receivedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        const now = FieldValue.serverTimestamp();
        tx.set(eventRef, {
          orderId,
          transactionId,
          success,
          amountCents,
          receivedAt: now,
        });

        if (data['status'] === 'confirmed' || data['status'] === 'cancelled') {
          return;
        }

        if (success) {
          tx.update(orderRef, {
            status: 'confirmed',
            'paymob.transactionId': transactionId,
            'paymob.paidAt': now,
            confirmedAt: now,
            confirmedBy: 'paymob-webhook',
            updatedAt: now,
          });
        } else {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable fingerprint for logs without leaking full payloads. */
export function fingerprintPayload(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}
