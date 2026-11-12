import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { emailSignupDocId, normalizeSignupEmail } from '../marketing/email-signup.js';
import { DELETE_ACCOUNT_RECENT_MESSAGE, signedInRecently } from './account-deletion.js';
import { adminCallableOptions } from './callable-options.js';
import { requireRole } from './require-role.js';

export interface DeleteMyAccountResponse {
  readonly deleted: true;
}

const DELETE_FAILED = "We couldn't delete your account. Please try again in a moment.";

/**
 * Deletes the signed-in caller's account for good: their profile (`users/{uid}`), saved bag
 * (`carts/{uid}`), favorites (`favorites/{uid}/items`), the footer email sign-up for their address,
 * and finally the sign-in account itself. Past orders stay in our records (delivery, returns and
 * accounting) and are not touched. Admin accounts are refused (remove the admin role first), and the
 * caller must have signed in within the last 10 minutes. Safe to call again after a failure.
 */
export const deleteMyAccount = onCall(
  adminCallableOptions(),
  async (request): Promise<DeleteMyAccountResponse> => {
    const caller = await requireRole(request, 'user');
    if (caller.role !== 'user') {
      throw new HttpsError(
        'failed-precondition',
        "Admin and staff accounts can't be deleted here. Ask an admin to remove your dashboard access first.",
      );
    }
    if (!signedInRecently(request.auth?.token.auth_time)) {
      throw new HttpsError('failed-precondition', DELETE_ACCOUNT_RECENT_MESSAGE);
    }

    const db = getFirestore();
    try {
      await db.recursiveDelete(db.doc(`favorites/${caller.uid}`));
      await Promise.all([
        db.doc(`carts/${caller.uid}`).delete(),
        db.doc(`users/${caller.uid}`).delete(),
        db.doc(`roles/${caller.uid}`).delete(),
        caller.email
          ? db.doc(`emailSignups/${emailSignupDocId(normalizeSignupEmail(caller.email))}`).delete()
          : null,
      ]);
      await getAuth().deleteUser(caller.uid);
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      // Already gone (a retry after the sign-in account was removed): nothing left to do.
      if (code === 'auth/user-not-found') return { deleted: true };
      logger.error('Account deletion failed', {
        uid: caller.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError('unavailable', DELETE_FAILED);
    }

    logger.info('Account deleted', { uid: caller.uid });
    return { deleted: true };
  },
);
