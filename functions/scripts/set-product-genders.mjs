/**
 * One-off (ATS-106): save the approved gender on the clothing products, so Shop's
 * Gender filter and the home hero links (`/category/apparel?gender=men`) find them.
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/set-product-genders.mjs --project atteya-store-dev                          (dry run)
 *   node scripts/set-product-genders.mjs --project atteya-store-dev --apply                  (writes)
 *   node scripts/set-product-genders.mjs --project attiya-store --apply --confirm-prod       (prod)
 *
 * The list comes from `scripts/data/product-genders.json` (`{ "<slug>": "women" | "men" | "kids" | "unisex" }`),
 * approved by Youssef on Nov 9, 2026. On dev the manager agent may run --apply after a dry run; prod needs Youssef's OK (AGENTS.md, Deploy safety).
 * - Each product is found by `slug`. Only `gender`, `updatedAt` and `updatedBy` are written.
 * - Products not in the list are never read or touched, and a gender is never cleared.
 * - A product that already has the same gender is reported as "unchanged" and not written,
 *   so re-running is safe. A slug with no product (or more than one) is reported, never created.
 * After applying, run "Rebuild search" in Catalogue tools so Algolia picks up the genders.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/** Same ids as `PRODUCT_GENDER_IDS` in `src/products/product-form.ts`. */
const GENDERS = new Set(['women', 'men', 'kids', 'unisex']);

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
if (apply && projectId === 'attiya-store' && arg('confirm-prod') !== true) {
  throw new Error('Writing to prod requires --confirm-prod.');
}

const list = JSON.parse(readFileSync(new URL('./data/product-genders.json', import.meta.url), 'utf8'));
if (list === null || typeof list !== 'object' || Array.isArray(list)) {
  throw new Error('product-genders.json must be an object of slug -> gender');
}
const rows = Object.entries(list);
for (const [slug, gender] of rows) {
  if (slug.trim().length === 0) throw new Error('product-genders.json has an empty slug');
  if (!GENDERS.has(gender)) throw new Error(`${slug}: unknown gender ${JSON.stringify(gender)}`);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

let written = 0;
let unchanged = 0;
let missing = 0;
for (const [slug, gender] of rows) {
  const matches = await db.collection('products').where('slug', '==', slug).limit(2).get();
  if (matches.empty) {
    console.log(`MISSING   ${slug}  (no product with this slug)`);
    missing += 1;
    continue;
  }
  if (matches.size > 1) {
    console.log(`MISSING   ${slug}  (more than one product has this slug; left alone)`);
    missing += 1;
    continue;
  }
  const doc = matches.docs[0];
  const data = doc.data();
  const current = typeof data.gender === 'string' && data.gender.length > 0 ? data.gender : 'not set';
  const label = `${slug}  ${data.name ?? '(no name)'}  ${current} -> ${gender}`;
  if (current === gender) {
    console.log(`UNCHANGED ${label}  unchanged`);
    unchanged += 1;
    continue;
  }
  console.log(`${apply ? 'WRITE    ' : 'WOULD    '} ${label}`);
  if (apply) {
    await doc.ref.update({
      gender,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'script:set-product-genders',
    });
  }
  written += 1;
}

console.log(
  `\n${apply ? 'Wrote' : 'Would write'} ${written}, unchanged ${unchanged}, missing ${missing} (of ${rows.length}).` +
    (apply ? ' Now run Rebuild search in Catalogue tools.' : ' Dry run only; add --apply to write.'),
);
