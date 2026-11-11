import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentData, type WriteResult } from 'firebase-admin/firestore';
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
 *
 * Prefer {@link listAdminsViaMirrors} for the Settings list: a full
 * `listUsers` scan grows with every shopper account and routinely takes
 * seconds. Keep this scan for last-admin checks and bootstrap healing.
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

export interface ListedAdmin {
  readonly uid: string;
  readonly email: string;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

const GET_USERS_CHUNK = 100;

function listedAdminFromMirror(uid: string, email: string, data: DocumentData | undefined): ListedAdmin {
  const mirrorIsAdmin = data?.['role'] === 'admin';
  const updatedBy = data?.['updatedBy'];
  return {
    uid,
    email,
    updatedAt: mirrorIsAdmin ? timestampToIso(data?.['updatedAt']) : null,
    updatedBy: mirrorIsAdmin && typeof updatedBy === 'string' ? updatedBy : null,
  };
}

/**
 * Fast path for the Current admins table: read `roles` where role is admin
 * (O(admins)), then verify each uid still has the admin claim via getUsers.
 * Falls back to a full Auth scan only when the mirror index is empty or every
 * mirror is stale, and heals mirrors so the next open stays fast.
 *
 * Console-only claim grants that never wrote `roles/{uid}` stay invisible while
 * at least one mirrored admin still verifies — run set-admin (or Grant again)
 * so the mirror exists. setUserRole already reconciles mirrors on every change.
 */
export async function listAdminsViaMirrors(): Promise<readonly ListedAdmin[]> {
  const db = getFirestore();
  const auth = getAuth();
  const mirrorSnap = await db.collection('roles').where('role', '==', 'admin').get();

  if (!mirrorSnap.empty) {
    const byUid = new Map(mirrorSnap.docs.map((doc) => [doc.id, doc.data()] as const));
    const uids = [...byUid.keys()];
    const users: UserRecord[] = [];

    for (let i = 0; i < uids.length; i += GET_USERS_CHUNK) {
      const chunk = uids.slice(i, i + GET_USERS_CHUNK);
      const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
      users.push(...result.users);
    }

    const admins: ListedAdmin[] = [];
    for (const user of users) {
      if (readRole(user.customClaims) !== 'admin') continue;
      admins.push(
        listedAdminFromMirror(user.uid, (user.email ?? '').trim().toLowerCase(), byUid.get(user.uid)),
      );
    }

    if (admins.length > 0) {
      return admins;
    }
  }

  const claimAdmins = await listClaimAdmins();
  await reconcileAdminMirrors(claimAdmins);
  const snaps =
    claimAdmins.length > 0
      ? await db.getAll(...claimAdmins.map((admin) => db.doc(`roles/${admin.uid}`)))
      : [];

  return claimAdmins.map((admin, index) =>
    listedAdminFromMirror(admin.uid, admin.email, snaps[index]?.data()),
  );
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
  await getFirestore()
    .doc(`roles/${uid}`)
    .set({ revokeTimeMs: revokeTimeMs(refreshed.tokensValidAfterTime) }, { merge: true });
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
