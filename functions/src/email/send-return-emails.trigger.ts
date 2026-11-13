import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { RESEND_API_KEY, RESEND_FROM, RESEND_REPLY_TO, STORE_ALERT_EMAIL } from './email-config.js';
import { emailContext } from './email-context.js';
import type { OrderEmailContext } from './order-email-templates.js';
import { sendResendEmail } from './resend-client.js';
import { returnClaimId, returnEmailsForWrite, type ReturnEmailKind } from './return-email-events.js';
import { readReturnForEmail, type ReturnEmailRequest } from './return-email-model.js';
import { renderReturnEmail } from './return-email-templates.js';
import { isReturnStatus } from '../store/returns.js';

/**
 * Sends return and exchange emails (ATS-291, ATS-294): a new request sends the staff alert
 * (`store-return-request`, to `STORE_ALERT_EMAIL`) and the shopper's "Request Sent"
 * (`return-requested`); each staff step forward sends the shopper one status email (Approved,
 * Rejected, Received, Refund Sent). Which emails: `returnEmailsForWrite`. Each (request, email) pair is
 * claimed in `returnEmails/{requestId}_{kind}` before sending, so a repeated trigger never sends
 * twice; a failed send is recorded there and not retried automatically (same as order emails).
 */
export const sendReturnEmails = onDocumentWritten(
  {
    document: 'returnRequests/{requestId}',
    region: 'europe-west3',
    secrets: [RESEND_API_KEY],
    retry: false,
  },
  async (event) => {
    const requestId = event.params.requestId;
    const beforeData = event.data?.before.exists ? event.data.before.data() : null;
    const afterData = event.data?.after.exists ? event.data.after.data() : null;
    // An update must never look like a new request, even when the old document can't be read in full.
    const beforeStatus = beforeData?.['status'];
    const before = beforeData
      ? (readReturnForEmail(requestId, beforeData, null) ??
        (isReturnStatus(beforeStatus) ? { status: beforeStatus } : null))
      : null;
    const after = readReturnForEmail(requestId, afterData, null);
    if (beforeData && !before) {
      logger.warn('Return email skipped: the earlier request could not be read', { requestId });
      return;
    }
    if (afterData && !after) {
      logger.warn('Return email skipped: the request could not be read', { requestId });
      return;
    }
    const kinds = returnEmailsForWrite(before, after);
    if (!after || kinds.length === 0) return;

    const db = getFirestore();
    // The order's view key, so a guest's "View Your Order" link opens without signing in.
    const orderSnap = await db.collection('orders').doc(after.orderId).get();
    const viewKey = orderSnap.get('viewKey');
    const request = readReturnForEmail(requestId, afterData, typeof viewKey === 'string' ? viewKey : null);
    if (!request) return;
    const ctx = emailContext();
    for (const kind of kinds) {
      await sendOnce(db, kind, request, ctx);
    }
  },
);

async function sendOnce(
  db: Firestore,
  kind: ReturnEmailKind,
  request: ReturnEmailRequest,
  ctx: OrderEmailContext,
): Promise<void> {
  const to = recipientFor(kind, request);
  if (!to) {
    logger.info('Return email skipped: no recipient', { requestId: request.id, kind });
    return;
  }
  const claim = returnClaimId(kind, request);
  const ref = db.collection('returnEmails').doc(claim);
  try {
    await ref.create({
      requestId: request.id,
      orderId: request.orderId,
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
    const email = renderReturnEmail(kind, request, ctx);
    const replyTo = RESEND_REPLY_TO.value().trim();
    const resendId = await sendResendEmail(apiKey, {
      from: RESEND_FROM.value().trim(),
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { replyTo } : {}),
      idempotencyKey: `return-email/${claim}`,
    });
    await ref.update({ status: 'sent', resendId, sentAt: FieldValue.serverTimestamp() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Return email failed', { requestId: request.id, kind, message });
    await ref.update({ status: 'failed', error: message.slice(0, 300) });
  }
}

function recipientFor(kind: ReturnEmailKind, request: ReturnEmailRequest): string | null {
  if (kind === 'store-return-request') {
    const alert = STORE_ALERT_EMAIL.value().trim();
    return alert.includes('@') ? alert : null;
  }
  return request.customer.email;
}
