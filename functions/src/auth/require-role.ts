import { getAuth } from 'firebase-admin/auth';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { requireAppCheck } from './callable-options.js';
import { isRevokedSession } from './session-revocation.js';

export type Role = 'user' | 'staff' | 'admin';

/** Admin and staff run the dashboard. Staff can't delete orders or change who has access. */
export function canManageStore(role: Role): boolean {
  return role === 'admin' || role === 'staff';
}

/** Reads the `role` custom claim. Anything other than `admin` or `staff` is a normal user. */
export function roleFromClaim(value: unknown): Role {
  return value === 'admin' || value === 'staff' ? value : 'user';
}

export interface RequiredCaller {
  readonly uid: string;
  readonly email?: string;
  /** True only when the ID token says the provider verified `email`. */
  readonly emailVerified: boolean;
  readonly role: Role;
}

/**
 * Shared callable guard. A missing claim, or any claim other than `admin` or
 * `staff`, is a normal user. The custom claim is the source of truth.
 * `needed: 'staff'` lets staff and admins in; `needed: 'admin'` lets only admins in.
 *
 * Staff and admin calls also reject sessions whose refresh tokens were revoked. An ID
 * token keeps the old `role` claim until it expires, so the claim alone is
 * not enough after `revokeRefreshTokens`.
 */
export async function requireRole(req: CallableRequest, needed: Role): Promise<RequiredCaller> {
  requireAppCheck(req);

  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in first.');
  }

  const role = roleFromClaim(req.auth.token.role);
  const allowed = needed === 'user' || (needed === 'staff' ? canManageStore(role) : role === 'admin');
  if (!allowed) {
    throw new HttpsError('permission-denied', "You don't have permission to do that.");
  }

  if (needed !== 'user') {
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
    emailVerified: req.auth.token.email_verified === true,
    role,
  };
}
