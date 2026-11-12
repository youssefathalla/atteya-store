/**
 * One-off (ATS-256): save `searchTokens` on orders placed before the admin Orders search existed,
 * so staff can find them by name (Arabic or English), phone, email or order number. New orders get
 * their words when they are placed (`orderSearchTokens()` in `functions/src/store/order-search.ts`).
 *
 * Run from the functions directory with Application Default Credentials:
 *   npm run build
 *   node scripts/fill-order-search.mjs --project atteya-store-dev           (dry run)
 *   node scripts/fill-order-search.mjs --project atteya-store-dev --apply   (writes)
 *
 * Prod needs --confirm-prod as well. Writes only `searchTokens` (never `updatedAt`, so the Orders
 * list keeps its order). Safe to run again: an order whose words are already right is skipped.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

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

const { orderSearchTokens } = require(join(__dirname, '../lib/store/order-search.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const sameList = (left, right) =>
  Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]);

const snap = await db.collection('orders').select('shipping', 'customerEmail', 'searchTokens').get();
let changed = 0;
let skipped = 0;
const noName = [];
let batch = db.batch();
let inBatch = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const fullName = typeof data.shipping?.fullName === 'string' ? data.shipping.fullName : '';
  const phone = typeof data.shipping?.phone === 'string' ? data.shipping.phone : '';
  if (!fullName) noName.push(doc.id);
  const tokens = orderSearchTokens({
    orderId: doc.id,
    fullName,
    phone,
    email: typeof data.customerEmail === 'string' ? data.customerEmail : null,
  });
  if (sameList(data.searchTokens, tokens)) {
    skipped += 1;
    continue;
  }
  changed += 1;
  if (changed <= 5) console.log(`${doc.id} (${fullName || 'no name'}): ${tokens.length} words`);
  if (dryRun) continue;
  batch.update(doc.ref, { searchTokens: tokens });
  inBatch += 1;
  if (inBatch === 400) {
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  }
}
if (!dryRun && inBatch > 0) await batch.commit();

if (noName.length > 0) console.log(`CHECK: ${noName.length} order(s) have no name: ${noName.join(', ')}`);
console.log(
  `${snap.size} orders. ${dryRun ? 'Would update' : 'Updated'} ${changed}, already right ${skipped}.` +
    (dryRun ? ' Dry run: pass --apply to write.' : ''),
);
