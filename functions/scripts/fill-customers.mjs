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
 * and a customer doc left with no orders and no account is removed.
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
  CUSTOMERS_COLLECTION,
  customerAccountFrom,
  customerEmailOf,
  customerIdFromEmail,
  customerOrderFrom,
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
const ordersSnap = await db
  .collection('orders')
  .select(
    'status',
    'customerEmail',
    'createdAt',
    'pricing.totalEgp',
    'shipping.fullName',
    'shipping.phone',
    'shipping.city',
    'shipping.country',
  )
  .get();
for (const doc of ordersSnap.docs) {
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
const accountByEmail = new Map();
let pageToken;
do {
  const page = await getAuth().listUsers(1000, pageToken);
  for (const user of page.users) {
    const email = customerEmailOf(user.email);
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

const comparable = (data) => {
  const { updatedAt: _updatedAt, ...rest } = data ?? {};
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
  writes.push({ id, doc: { ...doc, updatedAt: FieldValue.serverTimestamp() } });
}

const toRemove = [...existing.keys()].filter((id) => !keep.has(id));
removed = toRemove.length;

if (!dryRun) {
  let batch = db.batch();
  let inBatch = 0;
  const flush = async () => {
    if (inBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  };
  for (const { id, doc } of writes) {
    batch.set(db.collection(CUSTOMERS_COLLECTION).doc(id), doc);
    if (++inBatch === 400) await flush();
  }
  for (const id of toRemove) {
    batch.delete(db.collection(CUSTOMERS_COLLECTION).doc(id));
    if (++inBatch === 400) await flush();
  }
  await flush();
}

if (noEmail > 0) console.log(`CHECK: ${noEmail} order(s) have no usable email and belong to no customer.`);
if (capped.length > 0) {
  console.log(
    `CHECK: ${capped.length} customer(s) have more than ${MAX_CUSTOMER_ORDERS} orders; only the newest count.`,
  );
}
console.log(
  `${ordersSnap.size} orders, ${accountByEmail.size} accounts. ` +
    `${dryRun ? 'Would create' : 'Created'} ${created}, ${dryRun ? 'would change' : 'changed'} ${changed}, ` +
    `${dryRun ? 'would remove' : 'removed'} ${removed}, already right ${unchanged}.` +
    (dryRun ? ' Dry run: pass --apply to write.' : ''),
);
