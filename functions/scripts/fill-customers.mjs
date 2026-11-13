/**
 * One-off (ATS-276): builds `customers/{sha256(email)}` for every email that placed an order or
 * has an account, from all existing orders and accounts. New orders and accounts keep it up to date
 * through the customer triggers (`functions/src/customers/customer-summary.trigger.ts`), which use
 * the same rules (`buildCustomerSummary()` in `customer-summary.ts`).
 *
 * Run from the functions directory with Application Default Credentials:
 *   npm run build
 *   node scripts/fill-customers.mjs --project atteya-store-dev           (dry run)
 *   node scripts/fill-customers.mjs --project atteya-store-dev --apply   (writes)
 *
 * Prod needs --confirm-prod as well. Safe to run again: a customer that is already right is skipped,
 * and a customer doc left with no orders and no account is removed. Team accounts (admin or staff)
 * get no customer doc (ATS-288), so their existing docs are removed too.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) return true;
  return next;
};

const projectId = arg('project');
const dryRun = arg('apply') !== true;
const confirmProd = arg('confirm-prod') === true;

if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}
if (projectId === 'attiya-store' && !dryRun && !confirmProd) {
  throw new Error('Writing to prod requires --confirm-prod.');
}

const {
  buildCustomerSummary,
  CUSTOMER_ORDER_FIELDS,
  CUSTOMERS_COLLECTION,
  customerAccountFrom,
  customerEmailOf,
  customerIdFromEmail,
  customerOrderFrom,
  isTeamAccount,
  MAX_CUSTOMER_ORDERS,
} = require(join(__dirname, '../lib/customers/customer-summary.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const toMs = (value) => (value instanceof Timestamp ? value.toMillis() : null);
const toTimestamp = (ms) => (ms === null ? null : Timestamp.fromMillis(ms));

// Orders, grouped by lower-cased email.
const ordersByEmail = new Map();
const rawByEmail = new Map();
let noEmail = 0;
let noDate = 0;
const ordersSnap = await db
  .collection('orders')
  .select(...CUSTOMER_ORDER_FIELDS)
  .get();
for (const doc of ordersSnap.docs) {
  // The trigger orders by `createdAt`, which leaves out orders without it; do the same here.
  if (doc.get('createdAt') === undefined) {
    noDate += 1;
    continue;
  }
  const raw = doc.get('customerEmail');
  const email = customerEmailOf(raw);
  if (!email) {
    noEmail += 1;
    continue;
  }
  if (!ordersByEmail.has(email)) ordersByEmail.set(email, []);
  ordersByEmail.get(email).push(customerOrderFrom(doc.id, doc.data(), toMs(doc.get('createdAt'))));
  if (!rawByEmail.has(email)) rawByEmail.set(email, []);
  rawByEmail.get(email).push(raw);
}

// Accounts: an Auth user with an email and a `users/{uid}` doc.
const usersSnap = await db.collection('users').get();
const userDocs = new Map(usersSnap.docs.map((doc) => [doc.id, doc.data()]));
const rolesSnap = await db.collection('roles').get();
const mirrorRoles = new Map(rolesSnap.docs.map((doc) => [doc.id, doc.get('role')]));
const accountByEmail = new Map();
// Admins and staff get no customer record (ATS-288), like the triggers.
const teamEmails = new Set();
let pageToken;
do {
  const page = await getAuth().listUsers(1000, pageToken);
  for (const user of page.users) {
    const email = customerEmailOf(user.email);
    if (email && isTeamAccount(mirrorRoles.get(user.uid), user.customClaims?.role)) teamEmails.add(email);
    const data = userDocs.get(user.uid);
    if (!email || !data) continue;
    accountByEmail.set(
      email,
      customerAccountFrom(user.uid, data, user.emailVerified, Date.parse(user.metadata.creationTime) || null),
    );
  }
  pageToken = page.pageToken;
} while (pageToken);

const existingSnap = await db.collection(CUSTOMERS_COLLECTION).get();
const existing = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data()]));
const updateTimes = new Map(existingSnap.docs.map((doc) => [doc.id, doc.updateTime]));

const comparable = (data) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updatedAt: _updatedAt, builtFromReadTime: _builtFrom, ...rest } = data ?? {};
  return Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, value instanceof Timestamp ? value.toMillis() : value]),
  );
};

let created = 0;
let changed = 0;
let unchanged = 0;
let removed = 0;
const capped = [];
const writes = [];
const keep = new Set();

for (const email of new Set([...ordersByEmail.keys(), ...accountByEmail.keys()])) {
  if (teamEmails.has(email)) continue;
  // The trigger reads at most MAX_CUSTOMER_ORDERS; use the newest ones so both agree.
  const allOrders = ordersByEmail.get(email) ?? [];
  if (allOrders.length > MAX_CUSTOMER_ORDERS) capped.push(email);
  const orders = [...allOrders]
    .sort((left, right) => (right.createdAtMs ?? -1) - (left.createdAtMs ?? -1))
    .slice(0, MAX_CUSTOMER_ORDERS);
  const summary = buildCustomerSummary(
    email,
    orders,
    accountByEmail.get(email) ?? null,
    rawByEmail.get(email) ?? [],
  );
  if (!summary) continue;
  const id = customerIdFromEmail(email);
  keep.add(id);
  const { firstOrderAtMs, lastOrderAtMs, createdAtMs, ...rest } = summary;
  const doc = {
    ...rest,
    firstOrderAt: toTimestamp(firstOrderAtMs),
    lastOrderAt: toTimestamp(lastOrderAtMs),
    createdAt: toTimestamp(createdAtMs),
  };
  const before = existing.get(id);
  if (before && isDeepStrictEqual(comparable(before), comparable(doc))) {
    unchanged += 1;
    continue;
  }
  if (before) changed += 1;
  else created += 1;
  if (created + changed <= 5) {
    console.log(
      `${before ? 'CHANGE' : 'NEW'} ${id.slice(0, 8)}…: ${summary.orderCount} orders, EGP ${summary.spentEgp}`,
    );
  }
  writes.push({
    id,
    doc: { ...doc, builtFromReadTime: ordersSnap.readTime, updatedAt: FieldValue.serverTimestamp() },
  });
}

const toRemove = [...existing.keys()].filter((id) => !keep.has(id));
removed = toRemove.length;

// Each write is checked against the doc as it was read: a customer the triggers changed meanwhile
// is left alone (they already wrote newer totals) and counted, so a second run can pick it up.
let changedMeanwhile = 0;
if (!dryRun) {
  const ref = (id) => db.collection(CUSTOMERS_COLLECTION).doc(id);
  const guarded = async (write) => {
    try {
      await write();
    } catch (error) {
      // ALREADY_EXISTS (6) or FAILED_PRECONDITION (9): someone wrote the doc after it was read.
      if (error?.code === 6 || error?.code === 9) changedMeanwhile += 1;
      else throw error;
    }
  };
  for (const { id, doc } of writes) {
    const lastUpdateTime = updateTimes.get(id);
    await guarded(() => (lastUpdateTime ? ref(id).update(doc, { lastUpdateTime }) : ref(id).create(doc)));
  }
  for (const id of toRemove) {
    await guarded(() => ref(id).delete({ lastUpdateTime: updateTimes.get(id) }));
  }
}

if (noDate > 0) console.log(`CHECK: ${noDate} order(s) have no placed date and are left out.`);
if (noEmail > 0) console.log(`CHECK: ${noEmail} order(s) have no usable email and belong to no customer.`);
if (teamEmails.size > 0)
  console.log(`Team accounts (admin or staff) left out of Customers: ${teamEmails.size}.`);
if (capped.length > 0) {
  console.log(
    `CHECK: ${capped.length} customer(s) have more than ${MAX_CUSTOMER_ORDERS} orders; only the newest count.`,
  );
}
console.log(
  `${ordersSnap.size} orders, ${accountByEmail.size} accounts. ` +
    `${dryRun ? 'Would create' : 'Created'} ${created}, ${dryRun ? 'would change' : 'changed'} ${changed}, ` +
    `${dryRun ? 'would remove' : 'removed'} ${removed}, already right ${unchanged}.` +
    (dryRun ? '' : ` Changed meanwhile ${changedMeanwhile} (run again to check them).`) +
    (dryRun ? ' Dry run: pass --apply to write.' : ''),
);
