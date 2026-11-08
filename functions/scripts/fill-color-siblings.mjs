/**
 * One-off: fill `colorSiblings` (the other colours shown on product cards) for every product
 * that belongs to a model (`modelGroup`). New edits keep it current through the
 * `onProductColorSiblingsChange` trigger; this only fills products saved before that existed.
 *
 * Run from the functions directory with Application Default Credentials:
 *   npm run build
 *   node scripts/fill-color-siblings.mjs --project atteya-store-dev           (dry run)
 *   node scripts/fill-color-siblings.mjs --project atteya-store-dev --apply   (writes)
 *
 * Prod needs --confirm-prod as well. Safe to run again: a product whose list is already right
 * is not written. After applying, run "Rebuild search" in Catalogue Tools so Algolia records
 * carry the lists too (the search trigger also updates each product it sees change).
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

const { readModelGroup, refreshColorSiblings } = require(
  join(__dirname, '../lib/products/color-siblings.js'),
);

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snap = await db.collection('products').select('modelGroup').get();
const groups = new Set();
for (const doc of snap.docs) {
  const group = readModelGroup(doc.data());
  if (group) groups.add(group);
}

let total = 0;
for (const group of [...groups].sort()) {
  const count = await refreshColorSiblings(db, group, { dryRun });
  if (count > 0) console.log(`${dryRun ? 'would update' : 'updated'} ${count} product(s) in "${group}"`);
  total += count;
}

console.log(
  `${snap.size} products, ${groups.size} models. ${dryRun ? 'Would update' : 'Updated'} ${total} product(s).` +
    (dryRun ? ' Dry run: pass --apply to write.' : ' Now run Rebuild search in Catalogue Tools.'),
);
