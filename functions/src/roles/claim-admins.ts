import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentData, type WriteResult } from 'firebase-admin/firestore';
import { roleFromClaim, type Role } from '../auth/require-role.js';
import { revokeTimeMs } from '../auth/session-revocation.js';
import { isTeamRole, TEAM_ROLES, type TeamRole } from './team-roles.js';

/** A person whose Auth claim is admin or staff. */
export interface ClaimMember {
  readonly uid: string;
  readonly email: string;
  readonly role: TeamRole;
}

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 20;

export function readRole(claims: UserRecord['customClaims']): Role {
  if (!claims || typeof claims !== 'object') return 'user';
  return roleFromClaim((claims as { role?: unknown }).role);
}

/**
 * Auth custom claims are the source of truth. Mirror documents may be missing
 * for someone who was given access outside this repo.
 *
 * Prefer {@link listTeamViaMirrors} for the Settings list: a full
 * `listUsers` scan grows with every shopper account and routinely takes
 * seconds. Keep this scan for last-admin checks and bootstrap healing.
 */
export async function listClaimTeam(): Promise<readonly ClaimMember[]> {
  const auth = getAuth();
  const members: ClaimMember[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await auth.listUsers(LIST_PAGE_SIZE, pageToken);
    for (const user of result.users) {
      const role = readRole(user.customClaims);
      if (!isTeamRole(role)) continue;
      members.push({
        uid: user.uid,
        email: (user.email ?? '').trim().toLowerCase(),
        role,
      });
    }
    if (!result.pageToken) return members;
    pageToken = result.pageToken;
  }

  return members;
}

export interface ListedMember {
  readonly uid: string;
  readonly email: string;
  readonly role: TeamRole;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

const GET_USERS_CHUNK = 100;

function listedMemberFromMirror(
  uid: string,
  email: string,
  role: TeamRole,
  data: DocumentData | undefined,
): ListedMember {
  const mirrorMatches = data?.['role'] === role;
  const updatedBy = data?.['updatedBy'];
  return {
    uid,
    email,
    role,
    updatedAt: mirrorMatches ? timestampToIso(data?.['updatedAt']) : null,
    updatedBy: mirrorMatches && typeof updatedBy === 'string' ? updatedBy : null,
  };
}

/**
 * Fast path for the Team table: read `roles` where role is admin or staff
 * (O(team)), then check each uid's claim via getUsers; the claim decides the role shown.
 * Falls back to a full Auth scan only when the mirror index is empty or every
 * mirror is stale, and heals mirrors so the next open stays fast.
 *
 * Console-only claim grants that never wrote `roles/{uid}` stay invisible while
 * at least one mirrored member still verifies — run set-admin (or Grant again)
 * so the mirror exists. setUserRole already reconciles mirrors on every change.
 */
export async function listTeamViaMirrors(): Promise<readonly ListedMember[]> {
  const db = getFirestore();
  const auth = getAuth();
  const mirrorSnap = await db
    .collection('roles')
    .where('role', 'in', [...TEAM_ROLES])
    .get();

  if (!mirrorSnap.empty) {
    const byUid = new Map(mirrorSnap.docs.map((doc) => [doc.id, doc.data()] as const));
    const uids = [...byUid.keys()];
    const users: UserRecord[] = [];

    for (let i = 0; i < uids.length; i += GET_USERS_CHUNK) {
      const chunk = uids.slice(i, i + GET_USERS_CHUNK);
      const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
      users.push(...result.users);
    }

    const members: ListedMember[] = [];
    for (const user of users) {
      const role = readRole(user.customClaims);
      if (!isTeamRole(role)) continue;
      members.push(
        listedMemberFromMirror(user.uid, (user.email ?? '').trim().toLowerCase(), role, byUid.get(user.uid)),
      );
    }

    if (members.some((member) => member.role === 'admin')) {
      return members;
    }
  }

  const claimMembers = await listClaimTeam();
  await reconcileTeamMirrors(claimMembers);
  const snaps =
    claimMembers.length > 0
      ? await db.getAll(...claimMembers.map((member) => db.doc(`roles/${member.uid}`)))
      : [];

  return claimMembers.map((member, index) =>
    listedMemberFromMirror(member.uid, member.email, member.role, snaps[index]?.data()),
  );
}

/**
 * Makes `roles/{uid}` match the current admin and staff claims so the last-admin
 * transaction has documents to count. Does not write an audit record.
 * Claim holders missing a mirror, or with a mirror of another role, get theirs fixed.
 * Mirror docs that still say admin or staff after the claim was removed are marked
 * as regular accounts.
 */
export async function reconcileTeamMirrors(claimMembers: readonly ClaimMember[]): Promise<void> {
  const db = getFirestore();
  const claimRoles = new Map(claimMembers.map((member) => [member.uid, member.role] as const));
  const existing = await db
    .collection('roles')
    .where('role', 'in', [...TEAM_ROLES])
    .get();
  const mirrorRoles = new Map(existing.docs.map((doc) => [doc.id, doc.data()['role']] as const));
  const batch = db.batch();
  let writes = 0;

  for (const member of claimMembers) {
    if (mirrorRoles.get(member.uid) === member.role) continue;
    batch.set(
      db.doc(`roles/${member.uid}`),
      {
        role: member.role,
        email: member.email,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'claim',
      },
      { merge: true },
    );
    writes += 1;
  }

  for (const doc of existing.docs) {
    if (claimRoles.has(doc.id)) continue;
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
