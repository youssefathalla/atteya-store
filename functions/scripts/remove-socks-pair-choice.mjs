/**
 * One-off (ATS-94): make each socks page one pair. The old store import gave every socks product a
 * "Choose Your Pair" option (`key: 'choice'`) listing other brands' socks, and some (`babolat-socks`,
 * `nox-socks-2`) the same list as a `colour` option. The Gift Box and checkout can't give a product
 * with a second choice besides size, so the bag offer's "Free socks" gift showed no choices.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/remove-socks-pair-choice.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/remove-socks-pair-choice.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/remove-socks-pair-choice.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * For each product in SOCKS_SLUGS (only those 8) it:
 * - removes every `choice` and `colour` option; a `size` option stays. `nox-socks` is the exception
 *   (KEPT_KEYS_BY_SLUG): its `colour` option is a real Black / White choice, so it keeps it and only
 *   loses `choice`,
 * - rewrites `stock` / `stockBySize` / `inStock` with `stockFields()`: per size when the product
 *   keeps a size option (same counts), otherwise one plain count (today's total). `nox-socks` keeps
 *   its stock fields as they are,
 * - empties `variants` when every row points only at the removed options (stock is read from
 *   `stock`, never from variant rows, so nothing is lost). On `nox-socks` it only takes the `choice`
 *   key out of each row, so the per-colour rows stay; when rows for the same colour then disagree it
 *   leaves the product alone instead,
 * - when it removes a `colour` option, sets `colors` (Shop's colour filter) to the colours named in
 *   the product's name, or its slug when the name names none. When neither names a colour, or
 *   `colors` is locked, `colors` stays as it is and the dry run says so (check it in the product
 *   form). `colors` on `nox-socks`, and on products that lose only `choice`, is never touched.
 *
 * The dry run prints, per product, the option keys it removes and keeps, the options it removes
 * (with their choices), stock before and after, `colors` before and after, and whether the product
 * can then be given as a gift. It also counts the saved account bags that still hold one of these
 * socks with a removed choice.
 *
 * Skipped and only listed: a product that isn't found, has no stock count saved, has variant rows
 * that also point at an option that stays (set those in the admin), or keeps another option with
 * more than one choice (other than `nox-socks`'s colour). Each write is checked against the
 * document's last update time, so a product edited while the script runs is skipped instead of
 * overwritten; run it again to pick it up. Re-running is safe: a product with nothing left to
 * remove is left alone.
 *
 * Shoppers' bags are never edited. A bag line saved before this runs still holds the old choice;
 * the order callables refuse it ("One item in your bag has changed since you added it. Remove it and
 * add it again.", `order-selection.ts`), so the shopper adds the socks again from the product page.
 * Old orders keep their saved `optionLabels`, so they still show the pair ordered.
 *
 * Each write updates search by itself (`syncProductSearch`); run Catalogue Tools -> Rebuild search
 * after applying anyway. Agents never run --apply.
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
const REMOVED_KEYS = ['choice', 'colour'];

/**
 * Removed keys a product keeps on purpose. `nox-socks` has a real Black / White `colour` option next
 * to its cross-brand `choice`, so only `choice` goes; its stock and `colors` stay as they are.
 */
const KEPT_KEYS_BY_SLUG = { 'nox-socks': ['colour'] };

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
const { extractColorsFromName, sortColors } = require(join(__dirname, '../lib/products/catalog-taxonomy.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value : []);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The option keys this script removes from one product. */
function removedKeysFor(slug) {
  const kept = new Set(KEPT_KEYS_BY_SLUG[slug] ?? []);
  return new Set(REMOVED_KEYS.filter((key) => !kept.has(key)));
}

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

/** JSON with object keys sorted at every level, so two equal rows always compare equal. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isMap(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** "black, white" or "none". */
const describeColors = (colors) => (colors.length > 0 ? colors.join(', ') : 'none');

/** The palette ids named in the product's name, else in its slug, or [] when neither names one. */
function colorsFromNameOrSlug(name, slug) {
  const fromName = extractColorsFromName(name);
  if (fromName.length > 0) return { colors: fromName, from: 'name' };
  const fromSlug = extractColorsFromName(slug.replace(/[-_]+/g, ' '));
  return { colors: fromSlug, from: 'slug' };
}

/**
 * Variant rows once the removed keys are taken out of each one, for a product that keeps another
 * removed-list option on purpose (`nox-socks`). Rows that end up pointing at the same choices are
 * merged into the first one, but only when they agree on everything except their id. Returns
 * `{ rows }`, or `{ problem }` when that can't be done safely.
 */
function stripVariantRows(variants, removedKeys) {
  const bySignature = new Map();
  for (const row of variants) {
    const values = isMap(row?.values) ? row.values : {};
    const nextValues = Object.fromEntries(Object.entries(values).filter(([key]) => !removedKeys.has(key)));
    const signature = stableJson(nextValues);
    const nextRow = { ...row, values: nextValues };
    const rest = { ...nextRow };
    delete rest.id;
    const comparable = stableJson(rest);
    const seen = bySignature.get(signature);
    if (!seen) {
      bySignature.set(signature, { row: nextRow, comparable });
    } else if (seen.comparable !== comparable) {
      return { problem: 'rows for the same choice disagree (for example on stock) once the pair choice is gone' };
    }
  }
  const rows = [...bySignature.values()].map((entry) => entry.row);
  const empty = rows.filter((row) => Object.keys(row.values).length === 0);
  if (empty.length > 0 && rows.length > 1) {
    return { problem: 'some rows point only at the pair choice while others point at a choice that stays' };
  }
  return { rows: empty.length > 0 ? [] : rows };
}

/** product id -> the option keys removed from it, for counting saved bags. */
const removedKeysById = new Map();
let changed = 0;
let raced = 0;
const left = [];

for (const slug of SOCKS_SLUGS) {
  const snap = await productBySlug(slug);
  if (!snap) {
    left.push(`LEFT     ${slug} not found`);
    continue;
  }
  const removedKeys = removedKeysFor(slug);
  const keptOnPurpose = new Set(KEPT_KEYS_BY_SLUG[slug] ?? []);
  removedKeysById.set(snap.id, removedKeys);
  const data = snap.data();
  const name = trimmed(data.name) || slug;
  const options = asList(data.options);
  const removed = options.filter((option) => removedKeys.has(option?.key));
  const kept = options.filter((option) => !removedKeys.has(option?.key));
  const sizeOption = kept.find((option) => option?.key === 'size');
  const currentColors = asList(data.colors).filter((id) => typeof id === 'string');

  console.log(`\n${name}  (${slug}, ${snap.id})`);
  const keyList = (list) => [...new Set(list.map((option) => option?.key ?? '(no key)'))].join(', ') || 'none';
  console.log(`  option keys: remove ${keyList(removed)}; keep ${keyList(kept)}`);

  // A choice kept on purpose (nox-socks' colour) still stops the socks being given as a gift.
  const keptChoices = kept.filter(
    (option) => option?.key !== 'size' && keptOnPurpose.has(option?.key) && asList(option?.values).length > 1,
  );
  for (const option of keptChoices) {
    console.log(
      `  NOTE: keeps its own "${trimmed(option.label) || option.key}" choice on purpose ` +
        `(${asList(option.values).length} values), so it can't be given as a gift`,
    );
  }
  // Any other option with a real choice would still stop the socks being given as a gift.
  const otherChoices = kept.filter(
    (option) => option?.key !== 'size' && !keptOnPurpose.has(option?.key) && asList(option?.values).length > 1,
  );
  for (const option of otherChoices) {
    console.log(`  WARNING: keeps a "${trimmed(option.label) || option.key}" choice with ${option.values.length} values`);
  }
  const giftable = keptChoices.length === 0 && otherChoices.length === 0;

  if (removed.length === 0) {
    console.log(`  nothing to remove (already done)${giftable ? ', can be given as a gift' : ''}`);
    continue;
  }

  for (const option of removed) {
    const labels = asList(option.values).map((value) => trimmed(value?.label)).filter(Boolean);
    console.log(`  remove "${trimmed(option.label) || option.key}" (${option.key}): ${labels.join(', ') || 'no choices'}`);
  }
  for (const option of kept) {
    const labels = asList(option?.values).map((value) => trimmed(value?.label)).filter(Boolean).join(', ');
    console.log(`  keep "${trimmed(option?.label) || option?.key}" (${option?.key}): ${labels || 'no choices'}`);
  }

  if (otherChoices.length > 0) {
    left.push(`LEFT     ${slug} keeps another option with more than one choice; check it in the product form`);
    console.log('  left alone: another option with a real choice stays');
    continue;
  }

  const patch = { options: kept };

  const variants = asList(data.variants);
  const rowsPointAtRemoved = variants.some((row) =>
    Object.keys(isMap(row?.values) ? row.values : {}).some((key) => removedKeys.has(key)),
  );
  if (keptOnPurpose.size > 0) {
    // nox-socks: take only the removed keys out of each row; the per-colour rows stay.
    if (rowsPointAtRemoved) {
      const result = stripVariantRows(variants, removedKeys);
      if (result.problem) {
        left.push(`LEFT     ${slug} variant rows can't be kept per colour (${result.problem}); fix it in the admin`);
        console.log(`  left alone: ${result.problem}`);
        continue;
      }
      patch.variants = result.rows;
      console.log(`  variants: ${variants.length} rows -> ${result.rows.length} (pair choice taken out of each row)`);
    } else if (variants.length > 0) {
      console.log(`  variants: ${variants.length} rows unchanged`);
    }
    // Its stock stays exactly as it is.
    console.log(`  stock: unchanged ${describeStock(data.stock, data.stockBySize)}`);
    console.log(`  colors: unchanged ${describeColors(currentColors)} (keeps its own colour choice)`);
  } else {
    // Variant rows: drop them only when they point at nothing but the removed options.
    if (variants.length > 0) {
      const pointsElsewhere = variants.some((row) =>
        Object.keys(isMap(row?.values) ? row.values : {}).some((key) => !removedKeys.has(key)),
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

    // Colours: only when a `colour` option goes. Shop's colour filter reads `colors`, not the option.
    if (removed.some((option) => option?.key === 'colour')) {
      const locked = asList(data.lockedFields).includes('colors');
      const { colors: named, from } = colorsFromNameOrSlug(name, slug);
      const nextColors = sortColors(named);
      const same = JSON.stringify(sortColors(currentColors)) === JSON.stringify(nextColors);
      if (locked) {
        console.log(`  colors: unchanged ${describeColors(currentColors)} (set by hand and locked; check it in the product form)`);
      } else if (nextColors.length === 0) {
        console.log(
          `  colors: unchanged ${describeColors(currentColors)} (its name and slug name no colour, so it can't be ` +
            'worked out safely; set it in the product form)',
        );
      } else if (same) {
        console.log(`  colors: already ${describeColors(nextColors)} (from its ${from})`);
      } else {
        patch.colors = nextColors;
        console.log(`  colors: ${describeColors(currentColors)} -> ${describeColors(nextColors)} (from its ${from})`);
      }
    } else {
      console.log(`  colors: unchanged ${describeColors(currentColors)} (no colour option removed)`);
    }
  }

  if (giftable && data.published !== true) console.log('  NOTE: not published, so it can\'t be given as a gift yet');

  console.log(`  ${apply ? 'WRITE' : 'WOULD WRITE'}: ${Object.keys(patch).join(', ')}`);
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

// Saved account bags (`carts/{uid}`) that still hold these socks with a removed choice. They are
// only counted: once the option is gone, checkout refuses such a line, so the shopper adds the socks
// again from the product page. Guest bags live in browsers and can't be counted. A `nox-socks` line
// with only a colour is fine, so it isn't counted.
let savedBags = 0;
let savedLines = 0;
let cursor = null;
for (;;) {
  let page = db.collection('carts').orderBy('__name__').limit(300);
  if (cursor) page = page.startAfter(cursor);
  const snap = await page.get();
  for (const cart of snap.docs) {
    const stale = asList(cart.data().lines).filter((line) => {
      const removedKeys = removedKeysById.get(line?.productId);
      return (
        removedKeys !== undefined &&
        isMap(line?.selection) &&
        Object.keys(line.selection).some((key) => removedKeys.has(key))
      );
    });
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
    ? `\nSaved account bags with these socks and a removed choice: ${savedBags} (${savedLines} lines). ` +
        'After --apply, checkout asks those shoppers to remove the socks and add them again.'
    : '\nNo saved account bag holds these socks with a removed choice.',
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
