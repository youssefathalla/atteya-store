import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { RESEND_API_KEY, RESEND_FROM, RESEND_REPLY_TO, STORE_ALERT_EMAIL } from './email-config.js';
import { emailContext } from './email-context.js';
import { claimId, orderEmailsForWrite, type OrderEmailKind } from './order-email-events.js';
import { readOrderForEmail, type OrderEmailOrder } from './order-email-model.js';
import { renderOrderEmail, type OrderEmailContext } from './order-email-templates.js';
import { sendResendEmail } from './resend-client.js';

/**
 * Sends order emails when an order is placed, confirmed or fails.
 * Which emails: `orderEmailsForWrite`. Each (order, email) pair is claimed in
 * `orderEmails/{orderId}_{kind}` before sending, so a repeated trigger never
 * sends twice. A failed send is recorded there and not retried automatically.
 */
export const sendOrderEmails = onDocumentWritten(
  {
    document: 'orders/{orderId}',
    region: 'europe-west3',
    secrets: [RESEND_API_KEY],
    retry: false,
  },
  async (event) => {
    const orderId = event.params.orderId;
    const before = readOrderForEmail(orderId, event.data?.before.exists ? event.data.before.data() : null);
    const after = readOrderForEmail(orderId, event.data?.after.exists ? event.data.after.data() : null);
    const kinds = orderEmailsForWrite(before, after);
    if (!after || kinds.length === 0) return;

    const db = getFirestore();
    const order = await withMissingNames(db, after);
    const ctx = emailContext();

    for (const kind of kinds) {
      await sendOnce(db, kind, order, ctx);
    }
  },
);

async function sendOnce(
  db: Firestore,
  kind: OrderEmailKind,
  order: OrderEmailOrder,
  ctx: OrderEmailContext,
): Promise<void> {
  const to = recipientFor(kind, order);
  if (!to) {
    logger.info('Order email skipped: no recipient', { orderId: order.id, kind });
    return;
  }

  const claim = claimId(kind, order);
  const ref = db.collection('orderEmails').doc(claim);
  try {
    await ref.create({
      orderId: order.id,
      kind,
      status: 'sending',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Already claimed by an earlier run of this trigger.
    return;
  }

  try {
    const apiKey = RESEND_API_KEY.value().trim();
    if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
    const email = renderOrderEmail(kind, order, ctx);
    const replyTo = RESEND_REPLY_TO.value().trim();
    const resendId = await sendResendEmail(apiKey, {
      from: RESEND_FROM.value().trim(),
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { replyTo } : {}),
      idempotencyKey: `order-email/${claim}`,
    });
    await ref.update({ status: 'sent', resendId, sentAt: FieldValue.serverTimestamp() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Order email failed', { orderId: order.id, kind, message });
    await ref.update({ status: 'failed', error: message.slice(0, 300) });
  }
}

function recipientFor(kind: OrderEmailKind, order: OrderEmailOrder): string | null {
  if (kind === 'store-new-order') {
    const alert = STORE_ALERT_EMAIL.value().trim();
    return alert.includes('@') ? alert : null;
  }
  return order.customerEmail;
}

/** Orders placed before line names were saved: fill names from the product docs. */
async function withMissingNames(db: Firestore, order: OrderEmailOrder): Promise<OrderEmailOrder> {
  const missing = [...new Set(order.lines.filter((l) => !l.name).map((l) => l.productId))];
  if (missing.length === 0) return order;
  const snaps = await db.getAll(...missing.map((id) => db.collection('products').doc(id)));
  const names = new Map<string, string>();
  for (const snap of snaps) {
    const name = snap.exists ? snap.get('name') : null;
    if (typeof name === 'string' && name.trim()) names.set(snap.id, name.trim());
  }
  return {
    ...order,
    lines: order.lines.map((line) => (line.name ? line : { ...line, name: names.get(line.productId) ?? '' })),
  };
}
