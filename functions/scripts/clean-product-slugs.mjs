/**
 * One-off (ATS-115), once before launch: give every product a clean web address made from its name
 * and, only when the same product comes in several colours, its colour, so `/product/nox-socks` and
 * `/product/nox-socks-2` become `/product/nox-socks-white` and `/product/nox-socks-black`, while a
 * product that comes in one colour gets just its name (`/product/babolat-thermal-bottle`). Decided by
 * Youssef on Nov 9, 2026 (colour rule: ATS-118). Old addresses are not redirected
 * (the new site isn't live yet); they show the normal "not found" page.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/clean-product-slugs.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/clean-product-slugs.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/clean-product-slugs.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * Run it LAST on each project. The other one-off scripts find products by their old slug
 * (`scripts/data/*.json`, and the PRODUCTS / BAGS lists in the socks and bag scripts), so after this
 * one they report those products as missing.
 *
 * New slug, worked out the same way for every product (published or not):
 * - the product name with accents folded ("Galán" -> "galan"), lower-case, only a-z and 0-9, words
 *   joined by "-" (`slugBase()` in `src/products/slug.ts`, the same rule as the product form);
 * - that name slug is the product's base. Only when another product has the same base (the same name
 *   in another colour, such as Nox Socks white and black) does each of them also get the colours in
 *   `colors` (palette order) that the name doesn't already say, as their ids (`light-blue` stays
 *   `light-blue`). `multi` never adds a word. A colour counts as said when `extractColorsFromName()`
 *   finds it in the name, so "Charcoal Hoodie" + grey stays `charcoal-hoodie`. A product whose base
 *   no other product shares gets the bare base, whatever its colours.
 * - Products are taken in document-id order. When a slug is already taken, the later product gets
 *   `-2`, `-3`, ... and is listed as a clash, so a person can rename it in the product form and run
 *   the script again.
 * A product with no name keeps its slug and is listed.
 *
 * The dry run prints one row per product: name, old slug -> new slug, or "unchanged". It also lists
 * any link in `settings/*` (hero slides, navigation, home rows) that points at an old product address;
 * fix those by hand in the dashboard after applying, the script never edits them.
 *
 * --apply writes only `slug`, `updatedAt` and `updatedBy`, checked against the document's last update
 * time (a product edited meanwhile is skipped; run again). Document ids never change, so bags,
 * favourites, orders and offers, which all point at product ids, keep working. A new slug that another
 * product still holds (it hasn't been renamed yet) waits for a later pass in the same run; anything
 * still waiting at the end is listed and left alone. Re-running is safe: products that already match
 * are "unchanged".
 *
 * Each write updates search (`syncProductSearch`) and the colour siblings
 * (`onProductColorSiblingsChange`, so More Colours and the card swatches link to the new addresses) by
 * itself; run Catalogue Tools -> Rebuild search after applying anyway. Agents never run --apply.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}
const apply = arg('apply') === true;
if (apply && projectId === 'attiya-store' && arg('confirm-prod') !== true) {
  throw new Error('Writing to prod requires --confirm-prod.');
}

const { slugBase, nextSlug } = require(join(__dirname, '../lib/products/slug.js'));
const { sortColors, extractColorsFromName } = require(join(__dirname, '../lib/products/catalog-taxonomy.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const UPDATED_BY = 'script:clean-product-slugs';
const PAGE = 300;

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** "Adidas Ale Galán T-Shirt" -> "Adidas Ale Galan T-Shirt". */
const foldAccents = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The name slug and the colours the name doesn't already say. Null when there is no usable name. */
function slugParts(data) {
  const name = trimmed(data.name);
  if (!name) return null;
  const base = slugBase('', foldAccents(name));
  if (base === 'product' && !/product/i.test(name)) return null; // nothing usable in the name
  const said = new Set(extractColorsFromName(name));
  const colors = sortColors(Array.isArray(data.colors) ? data.colors : []).filter(
    (id) => id !== 'multi' && !said.has(id),
  );
  return { base, colors };
}

/** The slug a product wants: its base, plus its colours only when another product shares that base. */
const wantedSlug = (parts, sharedBases) =>
  sharedBases.has(parts.base) ? [parts.base, ...parts.colors].join('-') : parts.base;

// Every product, in document-id order (the order clashes are numbered in).
const products = [];
let cursor = null;
for (;;) {
  let page = db.collection('products').orderBy('__name__').limit(PAGE);
  if (cursor) page = page.startAfter(cursor);
  const snap = await page.get();
  products.push(...snap.docs);
  if (snap.size < PAGE) break;
  cursor = snap.docs[snap.docs.length - 1];
}

const taken = new Set();
const noName = [];
// How many products share each base (the same name in another colour).
const baseCount = new Map();
for (const snap of products) {
  const parts = slugParts(snap.data());
  if (parts) baseCount.set(parts.base, (baseCount.get(parts.base) ?? 0) + 1);
}
const sharedBases = new Set([...baseCount].filter(([, count]) => count > 1).map(([base]) => base));
const plan = []; // { snap, name, oldSlug, newSlug, clashWith }
// Products without a usable name keep their slug, so nobody else may take it.
for (const snap of products) {
  if (slugParts(snap.data()) === null) {
    const oldSlug = trimmed(snap.get('slug'));
    if (oldSlug) taken.add(oldSlug);
    noName.push(`${snap.id}  (slug "${oldSlug || 'none'}")`);
  }
}
for (const snap of products) {
  const data = snap.data();
  const parts = slugParts(data);
  if (parts === null) continue;
  const wanted = wantedSlug(parts, sharedBases);
  const newSlug = nextSlug(wanted, taken);
  taken.add(newSlug);
  plan.push({
    snap,
    name: trimmed(data.name),
    oldSlug: trimmed(data.slug),
    newSlug,
    clashWith: newSlug === wanted ? null : wanted,
  });
}

const changes = plan.filter((row) => row.oldSlug !== row.newSlug);
const clashes = plan.filter((row) => row.clashWith !== null);

const width = Math.min(48, Math.max(4, ...plan.map((row) => row.name.length)));
console.log(`${'NAME'.padEnd(width)}  OLD SLUG -> NEW SLUG`);
for (const row of plan) {
  const name = row.name.length > width ? `${row.name.slice(0, width - 1)}…` : row.name.padEnd(width);
  const move = row.oldSlug === row.newSlug ? `${row.oldSlug}  unchanged` : `${row.oldSlug || '(none)'} -> ${row.newSlug}`;
  const clash = row.clashWith ? `  CLASH: "${row.clashWith}" was taken, rename this product` : '';
  console.log(`${name}  ${move}${clash}`);
}

// Links in settings/* that point at an old product address. Reported only.
const renamed = new Map(changes.filter((row) => row.oldSlug).map((row) => [row.oldSlug, row.newSlug]));
const staleLinks = [];
const walk = (value, path, docId) => {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\/product\/([a-z0-9-]+)/g)) {
      const next = renamed.get(match[1]);
      if (next) staleLinks.push(`settings/${docId} ${path}: /product/${match[1]} -> /product/${next}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, docId));
  } else if (value !== null && typeof value === 'object' && typeof value.toDate !== 'function') {
    for (const [key, item] of Object.entries(value)) walk(item, path ? `${path}.${key}` : key, docId);
  }
};
const settings = await db.collection('settings').limit(50).get();
for (const doc of settings.docs) walk(doc.data(), '', doc.id);

let written = 0;
let raced = 0;
const waiting = [];
if (apply) {
  let pending = changes;
  // A new slug can still be another product's old one until that product is renamed: write the
  // free ones first and try the rest again, so two products never share a slug.
  while (pending.length > 0) {
    const next = [];
    for (const row of pending) {
      const holders = await db.collection('products').where('slug', '==', row.newSlug).limit(5).get();
      if (holders.docs.some((doc) => doc.id !== row.snap.id)) {
        next.push(row);
        continue;
      }
      try {
        await row.snap.ref.update(
          { slug: row.newSlug, updatedAt: FieldValue.serverTimestamp(), updatedBy: UPDATED_BY },
          { lastUpdateTime: row.snap.updateTime },
        );
        written += 1;
      } catch (error) {
        raced += 1;
        console.log(`SKIP     ${row.oldSlug}: changed while the script ran (${error.message}); run again`);
      }
    }
    if (next.length === pending.length) {
      waiting.push(...next);
      break;
    }
    pending = next;
  }
}

if (clashes.length > 0) {
  console.log(`\nClashes (${clashes.length}): rename these products in the product form, then run again.`);
  for (const row of clashes) console.log(`  ${row.name}  ${row.newSlug} (wanted ${row.clashWith})`);
}
if (noName.length > 0) {
  console.log(`\nNo usable name, slug kept (${noName.length}):`);
  for (const line of noName) console.log(`  ${line}`);
}
if (staleLinks.length > 0) {
  console.log(`\nLinks in settings to change by hand in the dashboard (${staleLinks.length}):`);
  for (const line of staleLinks) console.log(`  ${line}`);
} else {
  console.log('\nNo link in settings points at an old product address.');
}
if (waiting.length > 0) {
  console.log(`\nNot written, the new slug is still held by another product (${waiting.length}):`);
  for (const row of waiting) console.log(`  ${row.oldSlug} -> ${row.newSlug}`);
}

console.log(
  `\n${apply ? 'Wrote' : 'Would write'} ${apply ? written : changes.length} of ${products.length} products, ` +
    `unchanged ${plan.length - changes.length}, clashes ${clashes.length}` +
    `${apply ? `, changed meanwhile ${raced}, waiting ${waiting.length}` : ''}.` +
    (apply ? ' Now run Catalogue Tools -> Rebuild search.' : ' Dry run only; add --apply to write.'),
);
