/**
 * One-off (ATS-94): make each socks page one pair. The old store import gave every socks product a
 * "Choose Your Pair" option (`key: 'choice'`) listing other brands' socks, and the Nox ones the same
 * list as a `colour` option. The Gift Box and checkout can't give a product with a second choice
 * besides size, so the bag offer's "Free socks" gift showed no choices.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/remove-socks-pair-choice.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/remove-socks-pair-choice.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/remove-socks-pair-choice.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * For each product in SOCKS_SLUGS (only those 8) it:
 * - removes every `choice` and `colour` option; a `size` option stays,
 * - rewrites `stock` / `stockBySize` / `inStock` with `stockFields()`: per size when the product
 *   keeps a size option (same counts), otherwise one plain count (today's total),
 * - empties `variants` when every row points only at the removed options (stock is read from
 *   `stock`, never from variant rows, so nothing is lost).
 *
 * The dry run prints, per product, the options it removes (with their choices), stock before and
 * after, and whether the product can then be given as a gift. It also counts the saved account bags
 * that still hold one of these socks with an old pair or colour choice.
 *
 * Skipped and only listed: a product that isn't found, has no stock count saved, has variant rows
 * that also point at an option that stays (set those in the admin), or keeps another option with
 * more than one choice. Each write is checked against the document's last update time, so a product
 * edited while the script runs is skipped instead of overwritten; run it again to pick it up.
 * Re-running is safe: a product with no `choice` or `colour` option is left alone.
 *
 * Shoppers' bags are never edited. A bag line saved before this runs still holds the old choice;
 * the order callables refuse it ("One item in your bag has changed since you added it. Remove it and
 * add it again.", `order-selection.ts`), so the shopper adds the socks again from the product page.
 * Old orders keep their saved `optionLabels`, so they still show the pair ordered.
 *
 * Each write updates search by itself (`syncProductSearch`); run Catalogue Tools -> Rebuild search
 * after applying anyway so Shop's filters drop the old colours. Agents never run --apply.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** The socks products from the old store import (decided on ATS-94). Nothing else is touched. */
const SOCKS_SLUGS = [
  'on-socks-black',
  'on-white-socks',
  'socks',
  'siuxsocks',
  'siuxsocksblack',
  'babolat-socks',
  'nox-socks',
  'nox-socks-2',
];

/** Option keys that held the cross-brand pair list. `size` always stays. */
const REMOVED_KEYS = new Set(['choice', 'colour']);

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

const { stockFields } = require(join(__dirname, '../lib/products/stock.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value : []);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A product doc by slug (published or not), or null. */
async function productBySlug(slug) {
  const page = await db.collection('products').where('slug', '==', slug).limit(2).get();
  if (page.size > 1) console.log(`NOTE     more than one product has the slug "${slug}"; using ${page.docs[0].id}`);
  return page.empty ? null : page.docs[0];
}

/** "12" or "12 (by size: 4 + 8)". */
function describeStock(stock, stockBySize) {
  const total = typeof stock === 'number' ? `${stock}` : 'none';
  return isMap(stockBySize) ? `${total} (by size: ${Object.values(stockBySize).join(' + ') || 'none'})` : total;
}

const productIds = new Set();
let changed = 0;
let raced = 0;
const left = [];

for (const slug of SOCKS_SLUGS) {
  const snap = await productBySlug(slug);
  if (!snap) {
    left.push(`LEFT     ${slug} not found`);
    continue;
  }
  productIds.add(snap.id);
  const data = snap.data();
  const name = trimmed(data.name) || slug;
  const options = asList(data.options);
  const removed = options.filter((option) => REMOVED_KEYS.has(option?.key));
  const kept = options.filter((option) => !REMOVED_KEYS.has(option?.key));
  const sizeOption = kept.find((option) => option?.key === 'size');

  console.log(`\n${name}  (${slug}, ${snap.id})`);

  // Another option with a real choice would still stop the socks being given as a gift.
  const otherChoices = kept.filter((option) => option?.key !== 'size' && asList(option?.values).length > 1);
  for (const option of otherChoices) {
    console.log(`  WARNING: keeps a "${trimmed(option.label) || option.key}" choice with ${option.values.length} values`);
  }

  if (removed.length === 0) {
    console.log(`  no pair or colour choice (already done)${otherChoices.length > 0 ? '' : ', can be given as a gift'}`);
    continue;
  }

  for (const option of removed) {
    const labels = asList(option.values).map((value) => trimmed(value?.label)).filter(Boolean);
    console.log(`  remove "${trimmed(option.label) || option.key}" (${option.key}): ${labels.join(', ') || 'no choices'}`);
  }
  if (sizeOption) {
    const labels = asList(sizeOption.values).map((value) => trimmed(value?.label)).join(', ');
    console.log(`  keep "${trimmed(sizeOption.label) || 'Size'}": ${labels}`);
  }

  if (otherChoices.length > 0) {
    left.push(`LEFT     ${slug} keeps another option with more than one choice; check it in the product form`);
    console.log('  left alone: another option with a real choice stays');
    continue;
  }

  const patch = { options: kept };

  // Variant rows: drop them only when they point at nothing but the removed options.
  const variants = asList(data.variants);
  if (variants.length > 0) {
    const pointsElsewhere = variants.some((row) =>
      Object.keys(isMap(row?.values) ? row.values : {}).some((key) => !REMOVED_KEYS.has(key)),
    );
    if (pointsElsewhere) {
      left.push(`LEFT     ${slug} has variant rows that also point at an option that stays; fix it in the admin`);
      console.log(`  left alone: ${variants.length} variant rows also point at an option that stays`);
      continue;
    }
    patch.variants = [];
    console.log(`  variants: ${variants.length} rows for the removed choices emptied`);
  }

  // Stock: per size when a size option stays, otherwise one plain count of today's total.
  const map = isMap(data.stockBySize) ? data.stockBySize : null;
  if (!map && typeof data.stock !== 'number') {
    left.push(`LEFT     ${slug} has no stock count saved; set it in the product form, then run this again`);
    console.log('  left alone: no stock count saved');
    continue;
  }
  let next;
  if (sizeOption && map) {
    next = stockFields(map);
    patch.stockBySize = next.stockBySize;
  } else {
    next = stockFields(null, map ? stockFields(map).stock : data.stock);
    if (map) patch.stockBySize = FieldValue.delete();
  }
  patch.stock = next.stock;
  patch.inStock = next.inStock;
  console.log(
    `  stock: ${describeStock(data.stock, map)} -> ${describeStock(next.stock, next.stockBySize)}` +
      `${next.inStock ? '' : ' (out of stock)'}`,
  );
  if (sizeOption && !map) {
    console.log('  NOTE: it has a size option but no count per size; set them in the product form');
  }
  if (data.published !== true) console.log('  NOTE: not published, so it can\'t be given as a gift yet');

  console.log(`  ${apply ? 'WRITE' : 'WOULD WRITE'}`);
  if (apply) {
    try {
      await snap.ref.update(
        { ...patch, updatedAt: FieldValue.serverTimestamp() },
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

// Saved account bags (`carts/{uid}`) that still hold these socks with an old pair or colour choice.
// They are only counted: once the option is gone, checkout refuses such a line, so the shopper adds
// the socks again from the product page. Guest bags live in browsers and can't be counted.
let savedBags = 0;
let savedLines = 0;
let cursor = null;
for (;;) {
  let page = db.collection('carts').orderBy('__name__').limit(300);
  if (cursor) page = page.startAfter(cursor);
  const snap = await page.get();
  for (const cart of snap.docs) {
    const stale = asList(cart.data().lines).filter(
      (line) =>
        productIds.has(line?.productId) &&
        isMap(line?.selection) &&
        Object.keys(line.selection).some((key) => REMOVED_KEYS.has(key)),
    );
    if (stale.length > 0) {
      savedBags += 1;
      savedLines += stale.length;
    }
  }
  if (snap.size < 300) break;
  cursor = snap.docs[snap.docs.length - 1];
}
console.log(
  savedBags > 0
    ? `\nSaved account bags with these socks and an old choice: ${savedBags} (${savedLines} lines). ` +
        'After --apply, checkout asks those shoppers to remove the socks and add them again.'
    : '\nNo saved account bag holds these socks with an old choice.',
);

if (left.length > 0) {
  console.log('\nNot changed:');
  for (const line of left) console.log(line);
}

console.log(
  `\n${apply ? 'Changed' : 'Would change'} ${changed} of ${SOCKS_SLUGS.length} socks products` +
    `${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply ? ' Now run Catalogue Tools -> Rebuild search.' : ' Dry run only; add --apply to write.'),
);
