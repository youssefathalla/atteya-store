import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import {
  listClaimTeam,
  listTeamViaMirrors,
  readRole,
  reconcileTeamMirrors,
  recordSessionRevocation,
  revertRoleMirror,
} from './claim-admins.js';
import { parseSetUserRoleInput } from './roles.validation.js';
import { endsSession, isLastAdminRemoval, type TeamRole } from './team-roles.js';

const LAST_ADMIN_MESSAGE = "You're the only admin. Add another admin before changing your access.";
const UNKNOWN_ACCOUNT_MESSAGE =
  'No account uses that email yet. Ask them to sign in once with Google, or add them under Authentication → Users first.';

/** One person on the Team table (admin or staff). */
export interface AdminRecord {
  readonly uid: string;
  readonly email: string;
  readonly role: TeamRole;
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

/**
 * Settings → Team: everyone with admin or staff access (the name stays `listAdmins`, so a
 * deploy never deletes and recreates the function). Admins only.
 */
export const listAdmins = onCall(adminCallableOptions(), async (request): Promise<AdminRecord[]> => {
  await requireRole(request, 'admin');

  // Mirror index + getUsers (O(team)). Full Auth listUsers only on bootstrap
  // or when every mirror is stale — see listTeamViaMirrors.
  const members = [...(await listTeamViaMirrors())];
  members.sort(
    (left, right) =>
      Number(right.role === 'admin') - Number(left.role === 'admin') || left.email.localeCompare(right.email),
  );
  return members;
});

export const setUserRole = onCall(adminCallableOptions(), async (request): Promise<SetUserRoleResult> => {
  const actor = await requireRole(request, 'admin');
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

  const claimTeam = await listClaimTeam();
  const otherClaimAdmins = claimTeam.filter(
    (member) => member.role === 'admin' && member.uid !== user.uid,
  ).length;
  if (isLastAdminRemoval(before, input.role, otherClaimAdmins)) {
    throw new HttpsError('failed-precondition', LAST_ADMIN_MESSAGE);
  }

  await reconcileTeamMirrors(claimTeam);

  const db = getFirestore();
  const auditRef = db.collection('auditLogs').doc();
  const actorLabel = actor.email ?? actor.uid;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('roles').where('role', '==', 'admin'));
    const otherMirrorAdmins = snap.docs.filter((doc) => doc.id !== user.uid).length;
    if (isLastAdminRemoval(before, input.role, otherMirrorAdmins)) {
      throw new HttpsError('failed-precondition', LAST_ADMIN_MESSAGE);
    }

    tx.set(
      db.doc(`roles/${user.uid}`),
      {
        role: input.role,
        email: input.email,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorLabel,
      },
      { merge: true },
    );
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
    if (endsSession(before, input.role)) {
      await recordSessionRevocation(user.uid);
    }
  } catch {
    try {
      await getAuth().setCustomUserClaims(user.uid, {
        ...(user.customClaims ?? {}),
        role: before,
      });
    } catch {
      // The claim write did not stick. The mirror rollback still runs.
    }
    try {
      await revertRoleMirror(user.uid, before, input.email, actorLabel, auditRef.path);
    } catch {
      // The next role change reconciles the mirror.
    }
    throw new HttpsError('internal', 'Could not update dashboard access. Please try again.');
  }

  return { changed: true };
});
