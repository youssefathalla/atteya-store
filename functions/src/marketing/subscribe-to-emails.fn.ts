import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions, requireAppCheck } from '../auth/callable-options.js';
import { utcDayKey } from '../orders/order-rate-limit.js';
import {
  emailSignupDocId,
  hashCallerIp,
  MAX_EMAIL_SIGNUPS_PER_UTC_DAY,
  nextDailySignupCount,
  nextStoreSignupCount,
  parseEmailSignupRequest,
  rateLimitExpireAt,
  storeSignupRateLimitId,
} from './email-signup.js';

export interface SubscribeToEmailsResponse {
  readonly status: 'subscribed' | 'already-subscribed';
}

/**
 * Email sign-up for new arrivals and offers (storefront footer, visitors who aren't signed in).
 * Open to anyone: no sign-in needed. Writes `emailSignups/{sha256(email)}` once per address
 * (`email`, `source`, `page`, `uid`, `createdAt`); a repeat returns `already-subscribed` and
 * changes nothing. Each caller IP (hashed, never stored) gets
 * `MAX_EMAIL_SIGNUPS_PER_IP_PER_UTC_DAY` attempts per UTC day, and the whole store
 * `MAX_EMAIL_SIGNUPS_PER_UTC_DAY` (`all_{day}`), both in `emailSignupRateLimits`.
 * Nothing sends emails to this list yet.
 */
export const subscribeToEmails = onCall(
  adminCallableOptions(),
  async (request): Promise<SubscribeToEmailsResponse> => {
    requireAppCheck(request);
    const input = parseEmailSignupRequest(request.data);
    // Express `req.ip` (the runtime trusts the Google front end's X-Forwarded-For). A caller can
    // add fake entries to that header, so this slows casual repeats rather than stopping a
    // determined bot. The store-wide daily cap below bounds that case; App Check enforcement
    // is the stronger guard once it is switched on.
    const ip = request.rawRequest?.ip || 'unknown';

    const db = getFirestore();
    const day = utcDayKey();
    const limits = db.collection('emailSignupRateLimits');
    const storeLimitRef = limits.doc(storeSignupRateLimitId(day));
    const rateLimitRef = limits.doc(`${hashCallerIp(ip)}_${day}`);
    const signupRef = db.collection('emailSignups').doc(emailSignupDocId(input.email));

    // Set inside the transaction (which may retry) and logged once after it commits.
    let filledStoreCap = false;
    const result = await db.runTransaction(async (tx) => {
      const [storeSnap, rateSnap, signupSnap] = await Promise.all([
        tx.get(storeLimitRef),
        tx.get(rateLimitRef),
        tx.get(signupRef),
      ]);
      const storeCount = nextStoreSignupCount(storeSnap.data()?.['count']);
      filledStoreCap = storeCount === MAX_EMAIL_SIGNUPS_PER_UTC_DAY;
      const count = nextDailySignupCount(rateSnap.data()?.['count']);
      const now = FieldValue.serverTimestamp();
      const expireAt = rateLimitExpireAt();
      tx.set(storeLimitRef, { day, count: storeCount, updatedAt: now, expireAt }, { merge: true });
      tx.set(rateLimitRef, { day, count, updatedAt: now, expireAt }, { merge: true });

      if (signupSnap.exists) return { status: 'already-subscribed' as const };

      tx.create(signupRef, {
        email: input.email,
        source: input.source,
        page: input.page,
        uid: request.auth?.uid ?? null,
        createdAt: now,
      });
      return { status: 'subscribed' as const };
    });

    if (filledStoreCap) {
      // Real visitors now get "We can't take more sign-ups today" until UTC midnight.
      logger.error('Email sign-ups reached the store-wide daily cap', {
        day,
        cap: MAX_EMAIL_SIGNUPS_PER_UTC_DAY,
      });
    }
    return result;
  },
);
