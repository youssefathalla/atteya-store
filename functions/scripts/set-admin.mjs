/**
 * Grant or revoke the admin or staff custom claim (staff: the whole dashboard except
 * deleting orders and managing who has access).
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/set-admin.mjs --project atteya-store-dev --email you@example.com --role admin
 *   node scripts/set-admin.mjs --project atteya-store-dev --email helper@example.com --role staff
 *   node scripts/set-admin.mjs --project atteya-store-dev --show --email you@example.com
 *   node scripts/set-admin.mjs --project atteya-store-dev --list
 *
 * The custom claim is the source of truth. --list reads claims, not roles/{uid},
 * so it still works when no mirror document exists. Granting or revoking also
 * writes roles/{uid} and an auditLogs record. This script will remove the last
 * admin; the setUserRole callable will not.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) return true;
  return next;
};

const projectId = arg('project');
if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();

if (arg('list')) {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const role = user.customClaims?.role;
      if (role === 'admin' || role === 'staff') {
        console.log(user.uid, user.email ?? '', role);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  process.exit(0);
}

const email = String(arg('email') ?? '')
  .trim()
  .toLowerCase();
if (!email) throw new Error('--email is required');

const user = await auth.getUserByEmail(email);
if (arg('show')) {
  console.log(
    user.uid,
    user.email,
    user.customClaims,
    user.providerData.map((provider) => provider.providerId),
  );
  process.exit(0);
}

const role = arg('role') ?? 'admin';
if (!['admin', 'staff', 'user'].includes(role)) throw new Error('--role must be admin, staff or user');
const RANK = { user: 0, staff: 1, admin: 2 };

const before = ['admin', 'staff'].includes(user.customClaims?.role) ? user.customClaims.role : 'user';
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role });

let revokeTimeMs;
// Less access than before: end the current sign-in, since the old ID token keeps the old role.
if (RANK[role] < RANK[before]) {
  await auth.revokeRefreshTokens(user.uid);
  const refreshed = await auth.getUser(user.uid);
  revokeTimeMs = Date.parse(refreshed.tokensValidAfterTime ?? '');
  if (!Number.isFinite(revokeTimeMs)) {
    throw new Error('Auth did not return a revocation time.');
  }
}

await db.doc(`roles/${user.uid}`).set(
  {
    role,
    email,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'cli',
    ...(revokeTimeMs === undefined ? {} : { revokeTimeMs }),
  },
  { merge: true },
);
await db.collection('auditLogs').add({
  action: 'role.set',
  targetUid: user.uid,
  targetEmail: email,
  from: before,
  to: role,
  actorUid: null,
  actorEmail: 'cli',
  at: FieldValue.serverTimestamp(),
});

console.log(`${projectId}: ${email} (${user.uid}) role ${before} → ${role}`);
