import { getAuth } from 'firebase-admin/auth';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { requireAppCheck } from './callable-options.js';
import { isRevokedSession } from './session-revocation.js';

export type Role = 'user' | 'admin';

export interface RequiredCaller {
  readonly uid: string;
  readonly email?: string;
  readonly role: Role;
}

/**
 * Shared callable guard. A missing claim, or any claim other than `admin`,
 * is a normal user. The custom claim is the source of truth.
 *
 * Admin calls also reject sessions whose refresh tokens were revoked. An ID
 * token keeps the old `role` claim until it expires, so the claim alone is
 * not enough after `revokeRefreshTokens`.
 */
export async function requireRole(req: CallableRequest, needed: Role): Promise<RequiredCaller> {
  requireAppCheck(req);

  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in first.');
  }

  const role: Role = req.auth.token.role === 'admin' ? 'admin' : 'user';
  if (needed === 'admin' && role !== 'admin') {
    throw new HttpsError('permission-denied', "You don't have permission to do that.");
  }

  if (needed === 'admin') {
    let tokensValidAfterTime: string | undefined;
    try {
      const record = await getAuth().getUser(req.auth.uid);
      tokensValidAfterTime = record.tokensValidAfterTime;
    } catch {
      throw new HttpsError('unauthenticated', 'Please sign in again.');
    }
    if (isRevokedSession(req.auth.token.auth_time, tokensValidAfterTime)) {
      throw new HttpsError('unauthenticated', 'Please sign in again.');
    }
  }

  const email = req.auth.token.email;
  return {
    uid: req.auth.uid,
    email: typeof email === 'string' ? email : undefined,
    role,
  };
}
