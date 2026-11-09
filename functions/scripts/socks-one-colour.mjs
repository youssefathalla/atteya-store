/**
 * One-off (ATS-113): one colour per socks product. The Nox socks are two products linked as colour
 * siblings, white (`nox-socks`) and black (`nox-socks-2`), but the white one also had its own
 * Black / White "Colour" choice and a black photo first in its gallery, so shoppers on the white page
 * could pick Black. Babolat Socks only come in white but were tagged white + black. Decided by
 * Youssef on Nov 9, 2026: white = white only, black = black only.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/socks-one-colour.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/socks-one-colour.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/socks-one-colour.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * Only the three products in PRODUCTS are touched:
 * - `nox-socks`: removes the `colour` option, takes the `colour` key out of each variant row (rows
 *   left with no choices are emptied; rows that end up on the same choice are merged, adding their
 *   counts), rewrites `stock` / `stockBySize` / `inStock` with `stockFields()` (one plain count of
 *   today's total, or per size with the same counts when a size option stays), removes the black
 *   photo REMOVED_PHOTO from `images` (the white photos stay, the first one becomes the main photo),
 *   and sets `colors: ['white']`.
 * - `nox-socks-2`: sets `colors: ['black']`.
 * - `babolat-socks`: sets `colors: ['white']`.
 * On all three it adds `colors` to `lockedFields`, so Check catalogue structure never changes the
 * colour back. Nothing is removed from Storage.
 *
 * The dry run prints, per product, options, stock, gallery and `colors` before -> after, and whether
 * it can then be given as a gift. It also counts saved account bags that still hold `nox-socks` with
 * a colour chosen.
 *
 * Skipped and only listed: a product that isn't found, `nox-socks` with no stock count saved, a
 * removed photo that isn't in the gallery (already done, or the path differs: check it in the product
 * form) is only noted, and a gallery that would end up empty is left alone. Each write is checked
 * against the document's last update time, so a product edited while the script runs is skipped
 * instead of overwritten; run it again to pick it up. Re-running is safe: a product that already
 * matches is left alone.
 *
 * Shoppers' bags are never edited. A bag line saved with the old colour is refused at checkout ("One
 * item in your bag has changed since you added it. Remove it and add it again.",
 * `order-selection.ts`), so the shopper adds the socks again. Old orders keep their saved
 * `optionLabels` and `imagePath`.
 *
 * Each write updates search (`syncProductSearch`) and the colour siblings
 * (`onProductColorSiblingsChange`, which picks up the new main photo) by itself; run Catalogue Tools
 * -> Rebuild search after applying anyway. Agents never run --apply.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** The black pair photo on the white Nox socks (checked by eye on ATS-113). */
const REMOVED_PHOTO = 'products/eo-2dc72650-7a71-425d-aac6-24f265aa3b9e/266b4e10ce2103c5.jpg';

/** slug -> what this script sets. Nothing else is touched. */
const PRODUCTS = {
  'nox-socks': { colors: ['white'], removeKeys: ['colour'], removePhotos: [REMOVED_PHOTO] },
  'nox-socks-2': { colors: ['black'], removeKeys: [], removePhotos: [] },
  'babolat-socks': { colors: ['white'], removeKeys: [], removePhotos: [] },
};

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
const { sortColors } = require(join(__dirname, '../lib/products/catalog-taxonomy.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value : []);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

/** `Colour: Black, White; Size: S, M` or "none". */
function describeOptions(options) {
  if (options.length === 0) return 'none';
  return options
    .map((option) => {
      const labels = asList(option?.values).map((value) => trimmed(value?.label)).filter(Boolean);
      return `${trimmed(option?.label) || option?.key} (${option?.key}): ${labels.join(', ') || 'no choices'}`;
    })
    .join('; ');
}

/** One photo per line, the main photo first. */
function printGallery(title, images) {
  console.log(`  ${title}:`);
  if (images.length === 0) console.log('    (no photos)');
  images.forEach((image, index) => console.log(`    ${index === 0 ? 'main' : `${index + 1}   `} ${trimmed(image?.path)}`));
}

const describeColors = (colors) => (colors.length > 0 ? colors.join(', ') : 'none');

/** JSON with object keys sorted, so two equal choice maps always compare equal. */
function stableJson(value) {
  if (!isMap(value)) return JSON.stringify(value) ?? 'null';
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

/**
 * Variant rows with the removed keys taken out. Rows left with no choices are dropped (so a product
 * with only the colour choice ends with no rows); rows that end up on the same choices are merged
 * into the first one with their counts added. Availability reads `stock`, never variant rows, so this
 * only keeps the old rows tidy.
 */
function stripVariantRows(variants, removedKeys) {
  const bySignature = new Map();
  for (const row of variants) {
    const values = isMap(row?.values) ? row.values : {};
    const nextValues = Object.fromEntries(Object.entries(values).filter(([key]) => !removedKeys.has(key)));
    if (Object.keys(nextValues).length === 0) continue;
    const signature = stableJson(nextValues);
    const count = typeof row?.stock === 'number' && row.stock > 0 ? Math.floor(row.stock) : 0;
    const seen = bySignature.get(signature);
    if (seen) seen.stock += count;
    else bySignature.set(signature, { ...row, values: nextValues, stock: count });
  }
  return [...bySignature.values()];
}

let changed = 0;
let raced = 0;
const left = [];
/** product id -> option keys removed from it, for counting saved bags. */
const removedKeysById = new Map();

for (const [slug, plan] of Object.entries(PRODUCTS)) {
  const snap = await productBySlug(slug);
  if (!snap) {
    left.push(`LEFT     ${slug} not found`);
    continue;
  }
  const data = snap.data();
  const name = trimmed(data.name) || slug;
  const removedKeys = new Set(plan.removeKeys);
  if (removedKeys.size > 0) removedKeysById.set(snap.id, removedKeys);
  console.log(`\n${name}  (${slug}, ${snap.id})`);

  const patch = {};
  let skip = null;

  // Options.
  const options = asList(data.options);
  const keptOptions = options.filter((option) => !removedKeys.has(option?.key));
  const removingOptions = keptOptions.length !== options.length;
  if (removingOptions) {
    patch.options = keptOptions;
    console.log(`  options: ${describeOptions(options)} -> ${describeOptions(keptOptions)}`);
  } else {
    console.log(`  options: unchanged ${describeOptions(options)}`);
  }
  const otherChoices = keptOptions.filter((option) => option?.key !== 'size' && asList(option?.values).length > 1);

  // Variant rows: only when an option goes.
  const variants = asList(data.variants);
  const rowsPointAtRemoved = variants.some((row) =>
    Object.keys(isMap(row?.values) ? row.values : {}).some((key) => removedKeys.has(key)),
  );
  if (rowsPointAtRemoved) {
    const rows = stripVariantRows(variants, removedKeys);
    patch.variants = rows;
    console.log(`  variants: ${variants.length} rows -> ${rows.length} (colour taken out of each row)`);
  } else if (variants.length > 0) {
    console.log(`  variants: ${variants.length} rows unchanged`);
  }

  // Stock: rewritten only when an option goes, with today's counts.
  if (removingOptions) {
    const sizeOption = keptOptions.find((option) => option?.key === 'size');
    const map = isMap(data.stockBySize) ? data.stockBySize : null;
    if (!map && typeof data.stock !== 'number') {
      skip = 'no stock count saved; set it in the product form, then run this again';
    } else {
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
      if (sizeOption && !map) console.log('  NOTE: it has a size option but no count per size; set them in the product form');
    }
  } else {
    console.log(`  stock: unchanged ${describeStock(data.stock, data.stockBySize)}`);
  }

  // Gallery.
  const images = asList(data.images);
  if (plan.removePhotos.length > 0) {
    const removing = new Set(plan.removePhotos);
    const keptImages = images.filter((image) => !removing.has(trimmed(image?.path)));
    for (const path of plan.removePhotos) {
      if (!images.some((image) => trimmed(image?.path) === path)) {
        console.log(`  NOTE: photo ${path} is not in the gallery (already removed, or check it in the product form)`);
      }
    }
    if (keptImages.length === images.length) {
      printGallery('gallery (unchanged)', images);
    } else if (keptImages.length === 0) {
      skip ??= 'removing the photo would leave no photos; check the gallery in the product form';
      printGallery('gallery (unchanged)', images);
    } else {
      patch.images = keptImages;
      printGallery('gallery before', images);
      printGallery('gallery after', keptImages);
    }
  } else {
    printGallery('gallery (unchanged)', images);
  }

  // Colours and the lock.
  const currentColors = asList(data.colors).filter((id) => typeof id === 'string');
  const nextColors = sortColors(plan.colors);
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

  if (otherChoices.length > 0) {
    console.log(`  NOTE: keeps another choice (${describeOptions(otherChoices)}), so it can't be given as a gift`);
  } else if (data.published !== true) {
    console.log("  NOTE: not published, so it can't be given as a gift yet");
  } else {
    console.log('  can be given as a gift (no choice besides size)');
  }

  if (skip) {
    left.push(`LEFT     ${slug} ${skip}`);
    console.log(`  left alone: ${skip}`);
    continue;
  }
  if (Object.keys(patch).length === 0) {
    console.log('  nothing to change (already done)');
    continue;
  }

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

// Saved account bags (`carts/{uid}`) that still hold nox-socks with a colour chosen. Only counted:
// once the option is gone, checkout refuses such a line and the shopper adds the socks again. Guest
// bags live in browsers and can't be counted.
let savedBags = 0;
let savedLines = 0;
if (removedKeysById.size > 0) {
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
}
console.log(
  savedBags > 0
    ? `\nSaved account bags with Nox socks and a colour chosen: ${savedBags} (${savedLines} lines). ` +
        'After --apply, checkout asks those shoppers to remove the socks and add them again.'
    : '\nNo saved account bag holds Nox socks with a colour chosen.',
);

if (left.length > 0) {
  console.log('\nNot changed:');
  for (const line of left) console.log(line);
}

const total = Object.keys(PRODUCTS).length;
console.log(
  `\n${apply ? 'Changed' : 'Would change'} ${changed} of ${total} socks products` +
    `${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply ? ' Now run Catalogue Tools -> Rebuild search.' : ' Dry run only; add --apply to write.'),
);
