import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { RESEND_API_KEY, RESEND_FROM, RESEND_REPLY_TO } from '../email/email-config.js';
import { sendResendEmail } from '../email/resend-client.js';
import { renderVerificationEmail } from '../email/verification-email-template.js';
import { utcDayKey } from '../orders/order-rate-limit.js';
import { STOREFRONT_URL } from '../paymob/paymob-config.js';
import { STORE_INFO } from '../store/store-info.js';
import { adminCallableOptions } from './callable-options.js';
import { requireRole } from './require-role.js';
import {
  nextVerificationSendCount,
  VERIFICATION_LIMIT_MESSAGE,
  verificationContinueUrl,
  verificationSendDocId,
  verificationSendExpireAt,
} from './verification-send.js';

export interface SendVerificationEmailResponse {
  readonly sent: true;
  /** The address the email went to. */
  readonly email: string;
}

const SEND_FAILED = "We couldn't send the email. Please try again in a moment.";

/**
 * Sends our own "Confirm Your Email" message (Resend, `RESEND_FROM`) to the signed-in caller's
 * email/password account. The link comes from Admin SDK `generateEmailVerificationLink` and returns
 * to `/account`, or to `returnPath` when it is a plain path on our site. Refuses an account that is
 * already confirmed (Google counts) or has no email, and allows 3 sends per account per UTC day
 * (`emailVerificationSends/{uid}_{day}`, `expireAt` 2 days later for a TTL policy). A send that
 * fails gives its count back.
 */
export const sendVerificationEmail = onCall(
  adminCallableOptions({ secrets: [RESEND_API_KEY] }),
  async (request): Promise<SendVerificationEmailResponse> => {
    const caller = await requireRole(request, 'user');
    const data =
      typeof request.data === 'object' && request.data !== null
        ? (request.data as Record<string, unknown>)
        : {};

    // The account record, not the token: the token may predate a confirmation in another tab.
    let email: string;
    try {
      const record = await getAuth().getUser(caller.uid);
      if (record.emailVerified) {
        throw new HttpsError('failed-precondition', 'Your email is already confirmed.');
      }
      if (!record.email) {
        throw new HttpsError('failed-precondition', 'This account has no email to confirm.');
      }
      email = record.email;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unauthenticated', 'Please sign in again.');
    }

    const db = getFirestore();
    const day = utcDayKey();
    const counterRef = db.collection('emailVerificationSends').doc(verificationSendDocId(caller.uid, day));
    const count = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const next = nextVerificationSendCount(snap.get('count'));
      if (next === null) throw new HttpsError('resource-exhausted', VERIFICATION_LIMIT_MESSAGE);
      tx.set(
        counterRef,
        {
          uid: caller.uid,
          day,
          count: next,
          updatedAt: FieldValue.serverTimestamp(),
          expireAt: verificationSendExpireAt(),
        },
        { merge: true },
      );
      return next;
    });

    try {
      const apiKey = RESEND_API_KEY.value().trim();
      if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
      const continueUrl = verificationContinueUrl(STOREFRONT_URL.value(), data['returnPath']);
      const link = await getAuth().generateEmailVerificationLink(
        email,
        continueUrl ? { url: continueUrl } : undefined,
      );
      const message = renderVerificationEmail({ storeName: STORE_INFO.name, link });
      const replyTo = RESEND_REPLY_TO.value().trim();
      await sendResendEmail(apiKey, {
        from: RESEND_FROM.value().trim(),
        to: [email],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo ? { replyTo } : {}),
        idempotencyKey: `verify-email-${caller.uid}-${day}-${count}`,
      });
    } catch (error) {
      logger.error('Confirm-your-email send failed', {
        uid: caller.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      await counterRef.update({ count: FieldValue.increment(-1) }).catch(() => undefined);
      throw new HttpsError('unavailable', SEND_FAILED);
    }

    return { sent: true, email };
  },
);
