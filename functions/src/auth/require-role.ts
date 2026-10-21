import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

export type Role = 'user' | 'admin';

export interface RequiredCaller {
  readonly uid: string;
  readonly email?: string;
  readonly role: Role;
}

/**
 * Shared callable guard. A missing claim, or any claim other than `admin`,
 * is a normal user. The custom claim is the source of truth.
 */
export function requireRole(req: CallableRequest, needed: Role): RequiredCaller {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in first.');
  }

  const role: Role = req.auth.token.role === 'admin' ? 'admin' : 'user';
  if (needed === 'admin' && role !== 'admin') {
    throw new HttpsError('permission-denied', "You don't have permission to do that.");
  }

  const email = req.auth.token.email;
  return {
    uid: req.auth.uid,
    email: typeof email === 'string' ? email : undefined,
    role,
  };
}
