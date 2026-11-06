/**
 * One-off: fill in `weightGrams` (shipping weight) for products that have none, from the
 * client's figures (Nov 2026):
 *   t-shirts 250 g · shorts 250 g · hoodies 800 g · socks 0 g · any "jacket" (by name) 800 g
 * Every other category is left empty until the client sends weights (checkout then charges the
 * biggest Egypt box for that order).
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/set-product-weights.mjs --project atteya-store-dev           (dry run)
 *   node scripts/set-product-weights.mjs --project atteya-store-dev --apply   (writes)
 *
 * Only touches products whose `weightGrams` is not a number yet, so re-running is safe and a
 * weight set by hand in the product form is never replaced. Keep the table in step with
 * `DEFAULT_WEIGHT_GRAMS_BY_CATEGORY` / `defaultWeightGrams()` in catalog-taxonomy.ts.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const WEIGHT_BY_CATEGORY = {
  't-shirts': 250,
  shorts: 250,
  hoodies: 800,
  socks: 0,
};
const JACKET_WEIGHT = 800;
const JACKET_NAME = /\b(jacket|windbreaker)\b|جاكيت|جاكت/i;

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
const apply = arg('apply') === true;

/** Same rule as `defaultWeightGrams()`: a jacket by name, else the leaf category, then parents. */
function weightFor(data) {
  const name = typeof data.name === 'string' ? data.name : '';
  if (JACKET_NAME.test(name)) return JACKET_WEIGHT;
  const ids = [];
  if (typeof data.categoryId === 'string') ids.push(data.categoryId);
  if (Array.isArray(data.categoryIds)) ids.push(...data.categoryIds.map(String));
  for (const id of ids) {
    if (Object.hasOwn(WEIGHT_BY_CATEGORY, id)) return WEIGHT_BY_CATEGORY[id];
  }
  return null;
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

// The whole catalogue is about a hundred products; read it in pages to stay bounded.
const PAGE = 200;
let written = 0;
let skipped = 0;
let noDefault = 0;
const leftEmpty = new Map();
let last = null;

for (;;) {
  let query = db.collection('products').orderBy('__name__').limit(PAGE);
  if (last) query = query.startAfter(last);
  const snap = await query.get();
  if (snap.empty) break;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.weightGrams === 'number') {
      skipped += 1;
      continue;
    }
    const grams = weightFor(data);
    if (grams === null) {
      noDefault += 1;
      const key = typeof data.categoryId === 'string' ? data.categoryId : '(no category)';
      leftEmpty.set(key, (leftEmpty.get(key) ?? 0) + 1);
      continue;
    }
    console.log(`${apply ? 'WRITE   ' : 'WOULD   '} ${data.name}  -> ${grams} g`);
    if (apply) {
      await doc.ref.update({
        weightGrams: grams,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    written += 1;
  }

  last = snap.docs.at(-1);
  if (snap.size < PAGE) break;
}

console.log(
  `\n${apply ? 'Wrote' : 'Would write'} ${written}, already set ${skipped}, no default ${noDefault}.` +
    (apply ? '' : ' Dry run only; add --apply to write.'),
);
if (leftEmpty.size > 0) {
  console.log('Left empty (by category):');
  for (const [category, count] of [...leftEmpty].sort()) console.log(`  ${category}: ${count}`);
}
