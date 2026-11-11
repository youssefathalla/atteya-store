/**
 * One-off, repeatable (ATS-119): tag look-alike products by their accent colour. Two products with
 * the same name and the same colour (the two "Head Padel Shorts", both black, one with a yellow logo
 * and one with a white logo) can't be told apart by Shop's colour filter, and the clean-product-URL
 * script gives them the same address. Rule (Youssef, Nov 9, 2026): same name and same colour -> add the
 * accent colour in `data/product-colour-fixes.json`, then run this script.
 *
 * `data/product-colour-fixes.json` maps a slug to `{ "id": "<document id>", "colors": [palette ids] }`
 * (a plain list of palette ids is also accepted when there is no id to give). A product is found by `id`
 * first and by `slug` only when there is no id or the id isn't found, so it keeps working after the
 * slug script renames slugs. Ids must be in the palette (`COLOR_IDS` in `catalog-taxonomy.ts`).
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/fix-product-colours.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/fix-product-colours.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/fix-product-colours.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * For every entry it sets `colors` to exactly that list (palette order), adds `colors` to
 * `lockedFields` (so Check catalogue structure never changes it back), and writes `updatedAt` and
 * `updatedBy`. Each write is checked against the document's last update time, so a product edited
 * while the script runs is skipped instead of overwritten; run it again to pick it up. Re-running is
 * safe: a product that already matches is left alone. The dry run prints colours before -> after and
 * lists products it can't find or entries it rejects. Nothing else on a product is touched.
 *
 * Each write updates search and the colour siblings by itself; run Catalogue Tools -> Rebuild search
 * after applying anyway. Run this before the clean-product-slugs script so the slugs see the new colours.
 * On dev the manager agent applies after a dry run; prod only on Youssef's OK. Cloud build sessions
 * never run it.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const UPDATED_BY = 'script:fix-product-colours';

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

const { COLOR_IDS, sortColors } = require(join(__dirname, '../lib/products/catalog-taxonomy.js'));
const FIXES = JSON.parse(readFileSync(join(__dirname, 'data/product-colour-fixes.json'), 'utf8'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value : []);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const describeColors = (colors) => (colors.length > 0 ? colors.join(', ') : 'none');

/** Reads one entry: `{ id?, colors }` or a plain list of palette ids. */
function readEntry(entry) {
  if (Array.isArray(entry)) return { id: '', colors: entry };
  if (entry !== null && typeof entry === 'object') return { id: trimmed(entry.id), colors: entry.colors };
  return { id: '', colors: undefined };
}

/** A product doc by id first, then by slug (published or not), or null. */
async function findProduct(slug, id) {
  if (id) {
    const byId = await db.collection('products').doc(id).get();
    if (byId.exists) return byId;
    console.log(`NOTE     no product has the id "${id}"; trying the slug "${slug}"`);
  }
  const page = await db.collection('products').where('slug', '==', slug).limit(2).get();
  if (page.size > 1)
    console.log(`NOTE     more than one product has the slug "${slug}"; using ${page.docs[0].id}`);
  return page.empty ? null : page.docs[0];
}

let changed = 0;
let raced = 0;
const left = [];
const entries = Object.entries(FIXES);

for (const [slug, raw] of entries) {
  const { id, colors } = readEntry(raw);
  const bad =
    !Array.isArray(colors) || colors.length === 0
      ? ['(no colours listed)']
      : colors.filter((c) => !COLOR_IDS.includes(c));
  if (bad.length > 0) {
    left.push(`REJECTED ${slug}: ${bad.join(', ')} not in the palette (${COLOR_IDS.join(', ')})`);
    continue;
  }

  const snap = await findProduct(slug, id);
  if (!snap) {
    left.push(`LEFT     ${slug}${id ? ` (${id})` : ''} not found`);
    continue;
  }
  const data = snap.data();
  console.log(`\n${trimmed(data.name) || slug}  (${trimmed(data.slug) || slug}, ${snap.id})`);

  const patch = {};
  const currentColors = asList(data.colors).filter((value) => typeof value === 'string');
  const nextColors = sortColors(colors);
  if (sameList(sortColors(currentColors), nextColors)) {
    console.log(`  colors: already ${describeColors(nextColors)}`);
  } else {
    patch.colors = nextColors;
    console.log(`  colors: ${describeColors(currentColors)} -> ${describeColors(nextColors)}`);
  }
  const locks = asList(data.lockedFields).filter((field) => typeof field === 'string');
  if (locks.includes('colors')) {
    console.log('  colors lock: already locked');
  } else {
    patch.lockedFields = [...locks, 'colors'];
    console.log('  colors lock: added');
  }

  if (Object.keys(patch).length === 0) {
    console.log('  nothing to change (already done)');
    continue;
  }

  console.log(`  ${apply ? 'WRITE' : 'WOULD WRITE'}: ${Object.keys(patch).join(', ')}`);
  if (apply) {
    try {
      await snap.ref.update(
        { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: UPDATED_BY },
        { lastUpdateTime: snap.updateTime },
      );
    } catch (error) {
      raced += 1;
      console.log(`  SKIP: changed while the script ran (${error.message}); run again`);
      continue;
    }
  }
  changed += 1;
}

if (left.length > 0) {
  console.log('\nNot changed:');
  for (const line of left) console.log(line);
}

console.log(
  `\n${apply ? 'Changed' : 'Would change'} ${changed} of ${entries.length} products` +
    `${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply ? ' Now run Catalogue Tools -> Rebuild search.' : ' Dry run only; add --apply to write.'),
);
