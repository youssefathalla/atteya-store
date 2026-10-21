import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole, type Role } from '../auth/require-role.js';
import {
  listClaimAdmins,
  readRole,
  reconcileAdminMirrors,
  revertRoleMirror,
  timestampToIso,
} from './claim-admins.js';
import { parseSetUserRoleInput } from './roles.validation.js';

const LAST_ADMIN_MESSAGE = "You're the only admin. Add another admin before removing yourself.";
const UNKNOWN_ACCOUNT_MESSAGE =
  'No account uses that email yet. Ask them to sign in once with Google, or add them under Authentication → Users first.';

export interface AdminRecord {
  readonly uid: string;
  readonly email: string;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export interface SetUserRoleResult {
  readonly changed: boolean;
}

function isUserNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'auth/user-not-found'
  );
}

function isLastAdminDemotion(role: Role, before: Role, otherAdminCount: number): boolean {
  return role === 'user' && before === 'admin' && otherAdminCount === 0;
}

export const listAdmins = onCall(adminCallableOptions(), async (request): Promise<AdminRecord[]> => {
  requireRole(request, 'admin');

  const claimAdmins = await listClaimAdmins();
  const db = getFirestore();
  const snaps =
    claimAdmins.length > 0
      ? await db.getAll(...claimAdmins.map((admin) => db.doc(`roles/${admin.uid}`)))
      : [];

  const admins = claimAdmins.map((admin, index): AdminRecord => {
    const data = snaps[index]?.data();
    const mirrorIsAdmin = data?.['role'] === 'admin';
    const updatedBy = data?.['updatedBy'];
    return {
      uid: admin.uid,
      email: admin.email,
      updatedAt: mirrorIsAdmin ? timestampToIso(data?.['updatedAt']) : null,
      updatedBy: mirrorIsAdmin && typeof updatedBy === 'string' ? updatedBy : null,
    };
  });

  admins.sort((left, right) => left.email.localeCompare(right.email));
  return admins;
});

export const setUserRole = onCall(
  adminCallableOptions(),
  async (request): Promise<SetUserRoleResult> => {
    const actor = requireRole(request, 'admin');
    const input = parseSetUserRoleInput(request.data);

    let user;
    try {
      user = await getAuth().getUserByEmail(input.email);
    } catch (error: unknown) {
      if (isUserNotFound(error)) {
        throw new HttpsError('not-found', UNKNOWN_ACCOUNT_MESSAGE);
      }
      throw new HttpsError('internal', 'Could not look up that account. Please try again.');
    }

    const before = readRole(user.customClaims);
    if (before === input.role) {
      return { changed: false };
    }

    const claimAdmins = await listClaimAdmins();
    const otherClaimAdmins = claimAdmins.filter((admin) => admin.uid !== user.uid).length;
    if (isLastAdminDemotion(input.role, before, otherClaimAdmins)) {
      throw new HttpsError('failed-precondition', LAST_ADMIN_MESSAGE);
    }

    await reconcileAdminMirrors(claimAdmins);

    const db = getFirestore();
    const auditRef = db.collection('auditLogs').doc();
    const actorLabel = actor.email ?? actor.uid;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(db.collection('roles').where('role', '==', 'admin'));
      const otherMirrorAdmins = snap.docs.filter((doc) => doc.id !== user.uid).length;
      if (isLastAdminDemotion(input.role, before, otherMirrorAdmins)) {
        throw new HttpsError('failed-precondition', LAST_ADMIN_MESSAGE);
      }

      tx.set(db.doc(`roles/${user.uid}`), {
        role: input.role,
        email: input.email,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorLabel,
      });
      tx.set(auditRef, {
        action: 'role.set',
        targetUid: user.uid,
        targetEmail: input.email,
        from: before,
        to: input.role,
        actorUid: actor.uid,
        actorEmail: actorLabel,
        at: FieldValue.serverTimestamp(),
      });
    });

    try {
      await getAuth().setCustomUserClaims(user.uid, {
        ...(user.customClaims ?? {}),
        role: input.role,
      });
      if (input.role === 'user') {
        await getAuth().revokeRefreshTokens(user.uid);
      }
    } catch {
      try {
        await revertRoleMirror(user.uid, before, input.email, actorLabel, auditRef.path);
      } catch {
        // The claim is unchanged. The next role change reconciles the mirror.
      }
      throw new HttpsError('internal', 'Could not update admin access. Please try again.');
    }

    return { changed: true };
  },
);
