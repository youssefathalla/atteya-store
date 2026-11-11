import { randomUUID } from 'node:crypto';
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
  isTooManyLinkAttempts,
  MAX_VERIFICATION_SENDS_PER_STORE_PER_UTC_DAY,
  nextVerificationSendCount,
  storeVerificationSendDocId,
  VERIFICATION_LIMIT_MESSAGE,
  VERIFICATION_STORE_LIMIT_MESSAGE,
  VERIFICATION_TRY_LATER_MESSAGE,
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
 * (`emailVerificationSends/{uid}_{day}`) and 300 for the whole store (`__all_{day}`), each with
 * `expireAt` 2 days later for a TTL policy. A send that fails before reaching Resend gives its counts
 * back; once Resend was called the counts stay (it may have delivered).
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
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'auth/user-not-found') throw new HttpsError('unauthenticated', 'Please sign in again.');
      logger.error('Confirm-your-email account read failed', {
        uid: caller.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError('unavailable', SEND_FAILED);
    }

    const db = getFirestore();
    const day = utcDayKey();
    const sends = db.collection('emailVerificationSends');
    const counterRef = sends.doc(verificationSendDocId(caller.uid, day));
    const storeRef = sends.doc(storeVerificationSendDocId(day));
    await db.runTransaction(async (tx) => {
      const [snap, storeSnap] = await Promise.all([tx.get(counterRef), tx.get(storeRef)]);
      const next = nextVerificationSendCount(snap.get('count'));
      if (next === null) throw new HttpsError('resource-exhausted', VERIFICATION_LIMIT_MESSAGE);
      const storeNext = nextVerificationSendCount(
        storeSnap.get('count'),
        MAX_VERIFICATION_SENDS_PER_STORE_PER_UTC_DAY,
      );
      if (storeNext === null) {
        logger.error('Confirm-your-email store-wide daily cap reached', { day });
        throw new HttpsError('resource-exhausted', VERIFICATION_STORE_LIMIT_MESSAGE);
      }
      const now = FieldValue.serverTimestamp();
      const expireAt = verificationSendExpireAt();
      tx.set(counterRef, { uid: caller.uid, day, count: next, updatedAt: now, expireAt }, { merge: true });
      tx.set(storeRef, { day, count: storeNext, updatedAt: now, expireAt }, { merge: true });
    });

    let resendCalled = false;
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
      resendCalled = true;
      const resendId = await sendResendEmail(apiKey, {
        from: RESEND_FROM.value().trim(),
        to: [email],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo ? { replyTo } : {}),
        // Each call carries a new link, so each send is its own Resend request.
        idempotencyKey: `verify-email-${caller.uid}-${randomUUID()}`,
      });
      // The id is how a missing email is traced in the Resend dashboard (Emails → Logs).
      logger.info('Confirm-your-email handed to Resend', { uid: caller.uid, resendId });
    } catch (error) {
      logger.error('Confirm-your-email send failed', {
        uid: caller.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!resendCalled) {
        const giveBack = { count: FieldValue.increment(-1) };
        await Promise.all([
          counterRef.update(giveBack).catch(() => undefined),
          storeRef.update(giveBack).catch(() => undefined),
        ]);
      }
      if (!resendCalled && isTooManyLinkAttempts(error)) {
        throw new HttpsError('resource-exhausted', VERIFICATION_TRY_LATER_MESSAGE);
      }
      throw new HttpsError('unavailable', SEND_FAILED);
    }

    return { sent: true, email };
  },
);
