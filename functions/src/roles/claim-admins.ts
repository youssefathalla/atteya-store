import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type WriteResult } from 'firebase-admin/firestore';
import type { Role } from '../auth/require-role.js';
import { revokeTimeMs } from '../auth/session-revocation.js';

export interface ClaimAdmin {
  readonly uid: string;
  readonly email: string;
}

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 20;

export function readRole(claims: UserRecord['customClaims']): Role {
  if (!claims || typeof claims !== 'object') return 'user';
  const role = (claims as { role?: unknown }).role;
  return role === 'admin' ? 'admin' : 'user';
}

/**
 * Auth custom claims are the source of truth. Mirror documents may be missing
 * for an admin that was granted outside this repo.
 */
export async function listClaimAdmins(): Promise<readonly ClaimAdmin[]> {
  const auth = getAuth();
  const admins: ClaimAdmin[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await auth.listUsers(LIST_PAGE_SIZE, pageToken);
    for (const user of result.users) {
      if (readRole(user.customClaims) !== 'admin') continue;
      admins.push({
        uid: user.uid,
        email: (user.email ?? '').trim().toLowerCase(),
      });
    }
    if (!result.pageToken) return admins;
    pageToken = result.pageToken;
  }

  return admins;
}

/**
 * Makes `roles/{uid}` match the current admin claims so the last-admin
 * transaction has a document to count. Does not write an audit record.
 * Claim holders missing a mirror get one. Mirror docs that still say admin
 * after the claim was removed are marked as regular accounts.
 */
export async function reconcileAdminMirrors(claimAdmins: readonly ClaimAdmin[]): Promise<void> {
  const db = getFirestore();
  const claimIds = new Set(claimAdmins.map((admin) => admin.uid));
  const existing = await db.collection('roles').where('role', '==', 'admin').get();
  const knownMirrorIds = new Set(existing.docs.map((doc) => doc.id));
  const batch = db.batch();
  let writes = 0;

  for (const admin of claimAdmins) {
    if (knownMirrorIds.has(admin.uid)) continue;
    batch.set(db.doc(`roles/${admin.uid}`), {
      role: 'admin',
      email: admin.email,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'claim',
    });
    writes += 1;
  }

  for (const doc of existing.docs) {
    if (claimIds.has(doc.id)) continue;
    batch.set(
      doc.ref,
      {
        role: 'user',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'claim',
      },
      { merge: true },
    );
    writes += 1;
  }

  if (writes > 0) {
    await batch.commit();
  }
}

export function timestampToIso(value: unknown): string | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/**
 * Ends the account's current sign-in and records the Auth revocation time
 * on `roles/{uid}` so security rules can reject the old ID token.
 */
export async function recordSessionRevocation(uid: string): Promise<void> {
  const auth = getAuth();
  await auth.revokeRefreshTokens(uid);
  const refreshed = await auth.getUser(uid);
  await getFirestore().doc(`roles/${uid}`).set(
    { revokeTimeMs: revokeTimeMs(refreshed.tokensValidAfterTime) },
    { merge: true },
  );
}

export async function revertRoleMirror(
  uid: string,
  role: Role,
  email: string,
  actor: string,
  auditPath: string,
): Promise<WriteResult[]> {
  const db = getFirestore();
  const batch = db.batch();
  batch.set(
    db.doc(`roles/${uid}`),
    {
      role,
      email,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    },
    { merge: true },
  );
  batch.delete(db.doc(auditPath));
  return batch.commit();
}
