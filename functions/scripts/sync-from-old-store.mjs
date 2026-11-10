/**
 * One-off (ATS-178): bring our catalogue up to date with the old EasyOrders store before launch.
 * The client kept editing the old store after our copy on Nov 5, 2026.
 *
 * Run from the functions directory, after `npm run build`, with Application Default Credentials:
 *   node scripts/sync-from-old-store.mjs --project atteya-store-dev                          (dry run)
 *   node scripts/sync-from-old-store.mjs --project atteya-store-dev --apply                  (writes)
 *   node scripts/sync-from-old-store.mjs --project attiya-store --apply --confirm-prod       (prod)
 *
 * On dev the manager agent may run --apply after a dry run; prod needs Youssef's OK (AGENTS.md, Deploy safety).
 *
 * What it does, for products copied from the old store only (matched by the saved `source.id`, never by name):
 * - PRICE  the old store's sale price becomes `price` and its price becomes `compareAtPrice`
 *          (no lower sale price: `price` only, `compareAtPrice` null).
 * - HIDE   a product that is hidden on, or gone from, the old store gets `published: false`.
 * - STOCK  only when the old store has a number above 0 on at least one size: every size takes the old
 *          store's count (matched by size name), through `stockFields()`. A product with no sizes takes
 *          the old store's quantity when stock tracking is on there.
 * It never changes names, descriptions, photos, colours, slugs or options, never touches a product made in
 * our admin, and never creates a product: products on the old store that we don't have are only listed.
 * A stock change that can't be matched size by size is listed as CHECK and left alone.
 * Each write is checked against the document's `updateTime`; "changed meanwhile" means run it again.
 * After applying, run "Rebuild search" in Catalogue tools.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const { stockFields } = require(join(__dirname, '../lib/products/stock.js'));

const OLD_STORE_API = 'https://api.easy-orders.net/api/v1';
/** The old store only answers when the request names its own website. */
const OLD_STORE_HEADERS = { Accept: 'application/json', Origin: 'https://www.atteyastore.com' };

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

/** `{ status, body }`; a network failure throws, so a broken read never looks like "gone". */
async function oldStore(path) {
  const response = await fetch(`${OLD_STORE_API}${path}`, { headers: OLD_STORE_HEADERS });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

const wholeNumber = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

/** Our price pair from the old store's `price` / `sale_price`, or null when the old price is unusable. */
function oldPrices(product) {
  const base = wholeNumber(product.price);
  const sale = wholeNumber(product.sale_price);
  if (base === null || base === 0) return null;
  return sale !== null && sale > 0 && sale < base
    ? { price: sale, compareAtPrice: base }
    : { price: base, compareAtPrice: null };
}

/** "T2 (M)" and "t2" are the same size: compare on the part before any bracket, in capitals. */
const sizeKey = (label) =>
  String(label ?? '')
    .split('(')[0]
    .trim()
    .toUpperCase();

const sizeValues = (data) => {
  const option = (Array.isArray(data.options) ? data.options : []).find((item) => item?.key === 'size');
  return Array.isArray(option?.values) ? option.values.filter((value) => typeof value?.id === 'string') : [];
};

/**
 * The stock the old store really holds for this product, in our shape, or a reason it can't be used.
 * Returns null when the old store has no stock numbers for it (left alone).
 */
function oldStock(old, data) {
  const variants = Array.isArray(old.variants) ? old.variants : [];
  const sizes = sizeValues(data);
  if (variants.length === 0) {
    if (old.track_stock !== true) return null;
    const count = wholeNumber(old.quantity);
    if (count === null) return { check: 'old store quantity is not a whole number' };
    if (sizes.length > 0) return { check: 'we have sizes, the old store has none' };
    return { fields: stockFields(null, count) };
  }
  if (!variants.some((variant) => Number(variant?.quantity) > 0)) {
    return old.track_stock === true ? { check: 'stock tracking is on but every size says 0' } : null;
  }
  if (sizes.length === 0) return { check: 'the old store has sizes, we have none' };
  const ours = new Map(sizes.map((value) => [sizeKey(value.label), value.id]));
  if (ours.size !== sizes.length) return { check: 'two of our sizes have the same name' };
  const counts = Object.fromEntries(sizes.map((value) => [value.id, null]));
  for (const variant of variants) {
    const count = wholeNumber(variant?.quantity);
    if (count === null) return { check: 'an old store size count is not a whole number' };
    const props = Array.isArray(variant.variation_props) ? variant.variation_props : [];
    const matched = props.map((prop) => ours.get(sizeKey(prop?.variation_prop))).filter(Boolean);
    if (matched.length !== 1) {
      const names = props.map((prop) => prop?.variation_prop).join(' + ') || '(no name)';
      return { check: `old store size "${names}" has no single match in our sizes` };
    }
    counts[matched[0]] = (counts[matched[0]] ?? 0) + count;
  }
  const unmatched = sizes.filter((value) => counts[value.id] === null).map((value) => value.label);
  if (unmatched.length > 0) return { check: `our size ${unmatched.join(', ')} is not on the old store` };
  return { fields: stockFields(counts) };
}

const sameMap = (left, right) => {
  const a = left && typeof left === 'object' ? left : {};
  const b = right && typeof right === 'object' ? right : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

const stockLine = (data, fields) => {
  const sizes = sizeValues(data);
  if (!fields.stockBySize) return String(fields.stock);
  return `${fields.stock} (${sizes.map((value) => `${value.label} ${fields.stockBySize[value.id]}`).join(', ')})`;
};

// ---- read the old store (visible products, then each one in full for its sizes)
const visible = [];
for (let page = 1; page <= 30; page += 1) {
  const { status, body } = await oldStore(`/products?limit=100&page=${page}`);
  if (status !== 200 || !Array.isArray(body?.data))
    throw new Error(`The old store did not answer (page ${page}).`);
  if (body.data.length === 0) break;
  visible.push(...body.data);
  if (body.next_page == null) break;
}
if (visible.length === 0) throw new Error('The old store returned no products; nothing was changed.');

const oldById = new Map();
for (let index = 0; index < visible.length; index += 8) {
  const batch = visible.slice(index, index + 8);
  const results = await Promise.all(
    batch.map((item) => oldStore(`/products/${encodeURIComponent(item.id)}`)),
  );
  results.forEach(({ status, body }, offset) => {
    if (status !== 200 || typeof body?.id !== 'string') {
      throw new Error(`The old store did not return "${batch[offset].name}"; nothing was changed.`);
    }
    oldById.set(body.id, body);
  });
}

// ---- compare with ours
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const snapshot = await db.collection('products').get();

const plans = [];
const checks = [];
const seenOldIds = new Set();
let untouched = 0;
let notFromOldStore = 0;
const shownOnOldHiddenOnOurs = [];

for (const doc of snapshot.docs) {
  const data = doc.data();
  const oldId =
    data.source?.system === 'easyorders' && typeof data.source.id === 'string' ? data.source.id : null;
  if (!oldId) {
    notFromOldStore += 1;
    continue;
  }
  seenOldIds.add(oldId);
  const label = `${data.name ?? '(no name)'}  [${data.slug ?? doc.id}]`;
  const changes = {};
  const notes = [];

  let old = oldById.get(oldId);
  if (!old) {
    // Not in the visible list: hidden there, or deleted. Anything else is an error, never a guess.
    const direct = await oldStore(`/products/${encodeURIComponent(oldId)}`);
    const hidden = direct.status === 200 && direct.body?.hidden === true;
    const gone = direct.status === 404;
    if (!hidden && !gone) {
      throw new Error(
        `Could not tell whether "${data.name}" is still on the old store (status ${direct.status}).`,
      );
    }
    if (data.published === true) {
      changes.published = false;
      notes.push(`HIDE   ${hidden ? 'hidden on' : 'gone from'} the old store`);
    }
    old = null;
  }

  if (old) {
    if (data.published !== true) shownOnOldHiddenOnOurs.push(label);
    const prices = oldPrices(old);
    if (!prices) {
      checks.push(`${label}: old store price is missing or not a whole number`);
    } else if (prices.price !== data.price || prices.compareAtPrice !== (data.compareAtPrice ?? null)) {
      changes.price = prices.price;
      changes.compareAtPrice = prices.compareAtPrice;
      const was = (price, compareAt) => `${price}${compareAt ? ` (was ${compareAt})` : ''}`;
      notes.push(
        `PRICE  ${was(data.price, data.compareAtPrice)} -> ${was(prices.price, prices.compareAtPrice)}`,
      );
    }
    const stock = oldStock(old, data);
    if (stock?.check) {
      checks.push(`${label}: stock left alone, ${stock.check}`);
    } else if (stock) {
      const { fields } = stock;
      const same =
        data.stock === fields.stock &&
        data.inStock === fields.inStock &&
        sameMap(data.stockBySize, fields.stockBySize);
      if (!same) {
        changes.stock = fields.stock;
        changes.inStock = fields.inStock;
        if (fields.stockBySize) changes.stockBySize = fields.stockBySize;
        const current = typeof data.stock === 'number' ? data.stock : 'no count';
        notes.push(`STOCK  ${current} -> ${stockLine(data, fields)}`);
      }
    }
  }

  if (notes.length === 0) {
    untouched += 1;
    continue;
  }
  plans.push({ doc, label, changes, notes });
}

// ---- report
const count = (word) => plans.filter((plan) => plan.notes.some((note) => note.startsWith(word))).length;
let written = 0;
let changedMeanwhile = 0;
for (const plan of plans) {
  console.log(`${apply ? 'WRITE' : 'WOULD'}  ${plan.label}`);
  for (const note of plan.notes) console.log(`         ${note}`);
  if (!apply) continue;
  try {
    await plan.doc.ref.update(
      { ...plan.changes, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'script:sync-from-old-store' },
      { lastUpdateTime: plan.doc.updateTime },
    );
    written += 1;
  } catch (error) {
    if (error?.code !== 9) throw error;
    console.log('         changed meanwhile, not written');
    changedMeanwhile += 1;
  }
}

if (checks.length > 0) {
  console.log('\nCHECK (nothing written for these):');
  for (const line of checks) console.log(`  ${line}`);
}
const missing = visible.filter((item) => !seenOldIds.has(item.id));
if (missing.length > 0) {
  console.log('\nOn the old store, not in ours (add them in the admin; this script never creates products):');
  for (const item of missing) {
    const prices = oldPrices(item);
    console.log(
      `  ${String(item.name).trim()}  ${prices ? prices.price : '?'} EGP  added ${String(item.created_at).slice(0, 10)}`,
    );
  }
}
if (shownOnOldHiddenOnOurs.length > 0) {
  console.log('\nShown on the old store, not published on ours (left alone):');
  for (const line of shownOnOldHiddenOnOurs) console.log(`  ${line}`);
}

console.log(
  `\nOld store: ${visible.length} visible products. Ours: ${snapshot.size} (${notFromOldStore} made in our admin, never touched).` +
    `\n${apply ? 'Wrote' : 'Would write'} ${apply ? written : plans.length} products: price ${count('PRICE')}, hide ${count('HIDE')}, stock ${count('STOCK')}.` +
    ` Unchanged ${untouched}, check ${checks.length}, missing from ours ${missing.length}` +
    (apply ? `, changed meanwhile ${changedMeanwhile}.` : '.') +
    (apply ? ' Now run Rebuild search in Catalogue tools.' : ' Dry run only; add --apply to write.'),
);
