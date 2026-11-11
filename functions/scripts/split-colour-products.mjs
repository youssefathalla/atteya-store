/**
 * One-off, repeatable (ATS-206): give every colour its own product and its own stock, so a sold-out
 * colour can hide itself and the one-page product editor (ATS-205) sees one product per colour.
 * Decided by Youssef on Nov 11, 2026: one product per colour, linked by `modelGroup` (as ATS-113 did
 * for the Nox socks), and colours still on the placeholder count start at 5 per size; real counts are
 * kept and staff set the rest in the admin.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/split-colour-products.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/split-colour-products.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/split-colour-products.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * Part 1, split. Every product whose `colour` option has 2 or more choices (on dev today:
 * nox-wpt-frame-protector, cork-frame-protector, floky-empower-knee-support,
 * floky-no-strain-arm-sleeve) becomes one product per colour:
 *   - the first colour (option order) keeps the existing document, id and slug unchanged; each other
 *     colour gets a new document (new id) copied from it, with the slug name + colour
 *     (`cork-frame-protector-baby-blue`; `-2`, `-3` when taken) and `source: null` (the old-store
 *     record stays on the original only, so the old-store catch-up never matches two products);
 *   - each colour has no `colour` option, one `colors` entry (the choice's palette colour, else
 *     `colorIdFor()` from its name or swatch), the shared `modelGroup` (the one it has, or one made
 *     from the name like `link-colour-models.mjs`), fresh `searchTokens`, and every lockable field
 *     locked;
 *   - variant rows keep only the rows of that colour (and rows with no colour), with the colour taken
 *     out; rows left with no choices are dropped and rows on the same choice are merged, as
 *     `socks-one-colour.mjs` did;
 *   - stock is 5 per size, or 5 flat with no sizes, through `stockFields()`;
 *   - photos come from `scripts/data/colour-split.json` (slug -> colour name -> photo paths, first =
 *     main photo), filled in after a dry run and approved by Youssef. Every path must be in the
 *     product's gallery. A product missing from the file, a colour with no photo, a path not in the
 *     gallery, a colour with no palette colour, a colour its model already has, a model name already
 *     used by another product, or a real stock count (not the placeholder, so no count is lost) is
 *     listed as CHECK and the product is not split.
 *   - new colours keep the original's `createdAt`, so old products don't jump to the top of "newest".
 *   - offers that name the original product id are listed (NOTE); add the new colours to them by hand.
 * The original is updated and the new colours are created in one transaction, checked against the
 * original's last update time (a product edited meanwhile is skipped; run again).
 *
 * Part 2, starting stock. Every other product in a model with 2 or more colours (counting the colours
 * part 1 creates) whose stock is still the untracked placeholder gets 5 per size (or 5 flat).
 * Placeholder = every size at `UNTRACKED_DEFAULT_STOCK` (10), or flat 10 with no size counts. Any other
 * count (real counts from the old store, such as 3/0/5/4/0) is left alone and listed. Each write is
 * checked against the document's last update time.
 *
 * The dry run prints, per product: before -> after for options, `colors`, slug, stock and photos per
 * colour, then totals. Re-running is safe: a split product has no colour choice left, and a product
 * already at 5 is "already 5".
 *
 * Shoppers' bags and old orders are never edited. A bag line saved with the old colour choice is
 * refused at checkout ("One item in your bag has changed since you added it. Remove it and add it
 * again.", `order-selection.ts`), and old orders keep their saved `optionLabels` and `imagePath`.
 * Nothing is removed from Storage.
 *
 * Each write updates search (`syncProductSearch`) and the colour siblings
 * (`onProductColorSiblingsChange`) by itself; run Catalogue Tools -> Rebuild search after applying
 * anyway. On dev the manager agent applies after a dry run; prod only on Youssef's OK (AGENTS.md,
 * Deploy safety). Cloud build sessions never run it.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const UPDATED_BY = 'script:split-colour-products';
/** Starting count per size (or flat) for a colour (Youssef, Nov 11, 2026). */
const START_STOCK = 5;
/** Same limit as `modelGroup` in `ProductSchema` and the product form (`MAX_SLUG`). */
const MAX_MODEL_GROUP = 80;
const PAGE = 300;

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

const { stockFields, readSizeValueIds, UNTRACKED_DEFAULT_STOCK } = require(
  join(__dirname, '../lib/products/stock.js'),
);
const { COLOR_IDS, colorIdFor } = require(join(__dirname, '../lib/products/catalog-taxonomy.js'));
const { slugBase, nextSlug } = require(join(__dirname, '../lib/products/slug.js'));
const { buildSearchTokens } = require(join(__dirname, '../lib/products/search-tokens.js'));
const { LOCKABLE_FIELDS } = require(join(__dirname, '../lib/products/lockable-fields.js'));

/** slug -> colour name -> photo paths (first = main photo). Filled after a dry run. */
const SPLIT_PHOTOS = JSON.parse(readFileSync(join(__dirname, 'data/colour-split.json'), 'utf8'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value : []);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const foldAccents = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
const folded = (value) => foldAccents(trimmed(value)).toLowerCase();
const modelFromName = (value) =>
  folded(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const colourKey = (label) => folded(label).replace(/\s+/g, ' ');

/** "12" or "12 (by size: 4 + 8)". */
function describeStock(stock, stockBySize) {
  const total = typeof stock === 'number' ? `${stock}` : 'none';
  return isMap(stockBySize)
    ? `${total} (by size: ${Object.values(stockBySize).join(' + ') || 'none'})`
    : total;
}

/** `Colour (colour): Black, White; Size (size): S, M` or "none". */
function describeOptions(options) {
  if (options.length === 0) return 'none';
  return options
    .map((option) => {
      const labels = asList(option?.values)
        .map((value) => trimmed(value?.label))
        .filter(Boolean);
      return `${trimmed(option?.label) || option?.key} (${option?.key}): ${labels.join(', ') || 'no choices'}`;
    })
    .join('; ');
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
 * The variant rows for one colour: rows of another colour are dropped, the colour key is taken out,
 * rows left with no choices are dropped, and rows that end up on the same choices are merged (counts
 * added). Availability reads `stock`, never variant rows, so this only keeps the old rows tidy.
 */
function variantRowsFor(variants, colourValueId) {
  const bySignature = new Map();
  for (const row of variants) {
    const values = isMap(row?.values) ? row.values : {};
    if (typeof values.colour === 'string' && values.colour !== colourValueId) continue;
    const nextValues = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'colour'));
    if (Object.keys(nextValues).length === 0) continue;
    const signature = stableJson(nextValues);
    const count = typeof row?.stock === 'number' && row.stock > 0 ? Math.floor(row.stock) : 0;
    const seen = bySignature.get(signature);
    if (seen) seen.stock += count;
    else bySignature.set(signature, { ...row, values: nextValues, stock: count });
  }
  return [...bySignature.values()];
}

/** 5 per size, or 5 flat when the options have no size. */
function startingStock(options) {
  const sizeIds = readSizeValueIds(options);
  return sizeIds.length > 0
    ? stockFields(Object.fromEntries(sizeIds.map((id) => [id, START_STOCK])))
    : stockFields(null, START_STOCK);
}

/** The palette colour of one colour choice, or null. */
function paletteColour(value) {
  if (typeof value?.color === 'string' && COLOR_IDS.includes(value.color)) return value.color;
  return colorIdFor(trimmed(value?.label), trimmed(value?.swatch) || undefined);
}

function printPhotos(title, paths) {
  console.log(`    ${title}:`);
  if (paths.length === 0) console.log('      (no photos)');
  paths.forEach((path, index) => console.log(`      ${index === 0 ? 'main' : `${index + 1}   `} ${path}`));
}

/** Still the untracked starting count: every size at 10, or flat 10 with no size counts. */
const isPlaceholder = (data) => {
  if (isMap(data.stockBySize)) {
    const counts = Object.values(data.stockBySize);
    return counts.length > 0 && counts.every((count) => count === UNTRACKED_DEFAULT_STOCK);
  }
  return data.stock === UNTRACKED_DEFAULT_STOCK;
};

// Every product, in document-id order.
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
console.log(`${products.length} products read from ${projectId}.`);

const takenSlugs = new Set(products.map((snap) => trimmed(snap.get('slug'))).filter(Boolean));
const productsByModel = new Map();
for (const snap of products) {
  const model = trimmed(snap.get('modelGroup'));
  if (!model) continue;
  if (!productsByModel.has(model)) productsByModel.set(model, new Set());
  productsByModel.get(model).add(snap.id);
}

// Offers that name a product id. A split leaves those ids on the first colour only.
const offers = (await db.collection('offers').get()).docs.map((offer) => ({
  id: offer.id,
  title: trimmed(offer.get('title')) || trimmed(offer.get('name')) || offer.id,
  json: JSON.stringify(offer.data()),
}));
/** Palette colours each model already has, by product id. */
const coloursOf = (id) => asList(products.find((snap) => snap.id === id)?.get('colors'));

const checks = [];
const splitIds = new Set();
/** model -> colours created by part 1 (counted for part 2). */
const createdByModel = new Map();
let split = 0;
const RACED = 'raced';
const failed = [];
let splitChecks = 0;
let coloursCreated = 0;
let raced = 0;

// ---------- Part 1: split ----------
console.log('\n=== Split: one product per colour ===');
const toSplit = products.filter((snap) => {
  const colour = asList(snap.get('options')).find((option) => option?.key === 'colour');
  return asList(colour?.values).length >= 2;
});
if (toSplit.length === 0) console.log('No product holds more than one colour.');

for (const snap of toSplit) {
  const data = snap.data();
  const slug = trimmed(data.slug);
  const name = trimmed(data.name) || slug;
  const options = asList(data.options);
  const colourOption = options.find((option) => option?.key === 'colour');
  const colourValues = asList(colourOption.values);
  const keptOptions = options.filter((option) => option?.key !== 'colour');
  const images = asList(data.images);
  const galleryByPath = new Map(images.map((image) => [trimmed(image?.path), image]));
  const variants = asList(data.variants);

  console.log(`\n${name}  (${slug}, ${snap.id})${data.published === true ? '' : ' (hidden)'}`);
  console.log(`  options: ${describeOptions(options)} -> ${describeOptions(keptOptions)}`);
  console.log(`  colors: ${describeColors(asList(data.colors))}`);
  console.log(`  stock: ${describeStock(data.stock, data.stockBySize)}`);
  console.log('  gallery today:');
  if (images.length === 0) console.log('    (no photos)');
  images.forEach((image, index) =>
    console.log(`    ${index === 0 ? 'main' : `${index + 1}   `} ${trimmed(image?.path)}`),
  );

  const problems = [];
  const plan = isMap(SPLIT_PHOTOS[slug]) ? SPLIT_PHOTOS[slug] : null;
  if (!plan) problems.push(`not in scripts/data/colour-split.json; add its photos per colour`);
  const planByColour = new Map(Object.entries(plan ?? {}).map(([label, paths]) => [colourKey(label), paths]));
  if (plan) {
    const known = new Set(colourValues.map((value) => colourKey(value?.label)));
    if (planByColour.size !== Object.keys(plan).length) {
      problems.push('colour-split.json names the same colour twice (in a different case or spelling)');
    }
    for (const label of Object.keys(plan)) {
      if (!known.has(colourKey(label)))
        problems.push(`colour-split.json names "${label}", which it doesn't have`);
    }
  }

  const model = trimmed(data.modelGroup) || modelFromName(name);
  if (!model || model.length > MAX_MODEL_GROUP || model !== modelFromName(model)) {
    problems.push(`no usable model name ("${model}"); set one in the admin`);
  } else if (!trimmed(data.modelGroup)) {
    const outsiders = [...(productsByModel.get(model) ?? [])].filter((id) => id !== snap.id);
    if (outsiders.length > 0)
      problems.push(`the model "${model}" is already used by ${outsiders.join(', ')}`);
  }

  if (!isPlaceholder(data)) {
    problems.push(
      `stock ${describeStock(data.stock, data.stockBySize)} is a real count, not the placeholder; ` +
        'split it by hand so no count is lost',
    );
  }
  if (trimmed(data.modelGroup)) {
    const others = [...(productsByModel.get(model) ?? [])].filter((id) => id !== snap.id);
    const taken = new Set(others.flatMap(coloursOf));
    const clash = colourValues.map(paletteColour).filter((color) => color && taken.has(color));
    if (clash.length > 0) {
      problems.push(`the model "${model}" already has a product in ${[...new Set(clash)].join(', ')}`);
    }
  }
  const namedBy = offers.filter((offer) => offer.json.includes(`"${snap.id}"`));
  if (namedBy.length > 0) {
    console.log(
      `  NOTE: offers that name this product keep only the first colour; add the new colours to: ` +
        namedBy.map((offer) => `${offer.title} (${offer.id})`).join(', '),
    );
  }

  const stock = startingStock(keptOptions);
  const colours = [];
  const seenColours = new Set();
  for (const [index, value] of colourValues.entries()) {
    const label = trimmed(value?.label);
    const color = paletteColour(value);
    if (!label || !trimmed(value?.id)) {
      problems.push(`colour choice ${index + 1} has no name or id`);
      continue;
    }
    if (seenColours.has(colourKey(label))) problems.push(`two colour choices are called "${label}"`);
    seenColours.add(colourKey(label));
    if (!color) problems.push(`"${label}" has no palette colour; set it in the product form`);
    const paths = asList(planByColour.get(colourKey(label)))
      .map(trimmed)
      .filter(Boolean);
    if (plan && paths.length === 0) problems.push(`"${label}" has no photo in colour-split.json`);
    const missing = paths.filter((path) => !galleryByPath.has(path));
    if (missing.length > 0)
      problems.push(`"${label}" lists photos not in the gallery: ${missing.join(', ')}`);
    const keepsDoc = index === 0;
    let newSlug = slug;
    if (!keepsDoc) {
      newSlug = nextSlug(slugBase('', `${foldAccents(name)} ${foldAccents(label)}`), takenSlugs);
      takenSlugs.add(newSlug);
    }
    colours.push({
      label,
      color,
      keepsDoc,
      slug: newSlug,
      ref: keepsDoc ? snap.ref : db.collection('products').doc(),
      images: [...new Set(paths)].map((path) => galleryByPath.get(path)).filter(Boolean),
      variants: variantRowsFor(variants, trimmed(value?.id)),
    });
  }

  const palette = colours.map((colour) => colour.color).filter(Boolean);
  const twice = [...new Set(palette.filter((color, index) => palette.indexOf(color) !== index))];
  if (twice.length > 0) {
    problems.push(
      `two colours would both be ${twice.join(', ')}; set each choice's colour in the product form`,
    );
  }

  const unlisted = images
    .map((image) => trimmed(image?.path))
    .filter(
      (path) => !colours.some((colour) => colour.images.some((image) => trimmed(image?.path) === path)),
    );
  if (plan && unlisted.length > 0) {
    console.log(
      `  NOTE: photos in no colour (kept in Storage, left off every colour): ${unlisted.join(', ')}`,
    );
  }

  for (const colour of colours) {
    console.log(`  ${colour.label}${colour.keepsDoc ? ` (keeps ${snap.id})` : ' (new product)'}:`);
    console.log(`    slug: ${colour.keepsDoc ? `unchanged ${slug}` : `${slug} -> ${colour.slug}`}`);
    console.log(`    options: ${describeOptions(keptOptions)}`);
    console.log(`    colors: ${describeColors(asList(data.colors))} -> ${colour.color ?? 'none (CHECK)'}`);
    console.log(`    model: ${trimmed(data.modelGroup) || 'none'} -> ${model}`);
    console.log(
      `    stock: ${describeStock(data.stock, data.stockBySize)} -> ${describeStock(stock.stock, stock.stockBySize)}`,
    );
    console.log(`    variants: ${variants.length} rows -> ${colour.variants.length}`);
    printPhotos(
      'photos',
      colour.images.map((image) => trimmed(image?.path)),
    );
  }

  if (problems.length > 0) {
    splitChecks += 1;
    for (const problem of problems) checks.push(`CHECK  ${slug}: ${problem}`);
    console.log(`  left alone: ${problems.join('; ')}`);
    continue;
  }

  const searchTokens = [...buildSearchTokens(name, model)];
  const shared = {
    options: keptOptions,
    modelGroup: model,
    searchTokens,
    lockedFields: [...LOCKABLE_FIELDS],
    stock: stock.stock,
    inStock: stock.inStock,
    stockBySize: stock.stockBySize ?? FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: UPDATED_BY,
  };

  console.log(
    `  ${apply ? 'WRITE' : 'WOULD WRITE'}: update ${snap.id}, create ${colours.length - 1} colour(s)`,
  );
  if (apply) {
    try {
      await db.runTransaction(async (tx) => {
        const live = await tx.get(snap.ref);
        if (!live.exists || !live.updateTime.isEqual(snap.updateTime)) {
          throw new Error(RACED);
        }
        const slugReads = await Promise.all(
          colours
            .filter((colour) => !colour.keepsDoc)
            .map((colour) => tx.get(db.collection('products').where('slug', '==', colour.slug).limit(1))),
        );
        if (slugReads.some((read) => !read.empty)) throw new Error(RACED);
        for (const colour of colours) {
          const own = {
            ...shared,
            colors: [colour.color],
            images: colour.images.map((image) => ({ ...image })),
            variants: colour.variants,
          };
          if (colour.keepsDoc) {
            tx.update(snap.ref, own);
            continue;
          }
          const copy = { ...live.data() };
          delete copy.colorSiblings;
          delete copy.stockBySize;
          const created = {
            ...copy,
            ...own,
            id: colour.ref.id,
            slug: colour.slug,
            source: null,
            createdBy: UPDATED_BY,
          };
          if (stock.stockBySize) created.stockBySize = stock.stockBySize;
          else delete created.stockBySize;
          tx.create(colour.ref, created);
        }
      });
    } catch (error) {
      if (error.message === RACED) {
        raced += 1;
        console.log('  SKIP: changed while the script ran; run again');
      } else {
        failed.push(`${slug}: ${error.message}`);
        console.log(`  FAILED: ${error.message}`);
      }
      continue;
    }
  }
  splitIds.add(snap.id);
  createdByModel.set(model, (createdByModel.get(model) ?? 0) + colours.length - 1);
  split += 1;
  coloursCreated += colours.length - 1;
}

// ---------- Part 2: starting stock ----------
console.log('\n=== Starting stock for colours still on the placeholder count ===');
const isStart = (data, next) =>
  data.stock === next.stock &&
  (isMap(data.stockBySize) ? stableJson(data.stockBySize) : 'none') ===
    (next.stockBySize ? stableJson(next.stockBySize) : 'none');

let setToFive = 0;
let alreadyFive = 0;
const leftAlone = [];
for (const snap of products) {
  // Split ones already start at 5; ones left as CHECK still share one count across colours.
  if (splitIds.has(snap.id) || toSplit.includes(snap)) continue;
  const data = snap.data();
  const model = trimmed(data.modelGroup);
  if (!model) continue;
  const colours = (productsByModel.get(model)?.size ?? 0) + (createdByModel.get(model) ?? 0);
  if (colours < 2) continue;
  const slug = trimmed(data.slug) || snap.id;
  const next = startingStock(asList(data.options));
  if (isStart(data, next)) {
    alreadyFive += 1;
    continue;
  }
  if (!isPlaceholder(data)) {
    leftAlone.push(`${slug}: ${describeStock(data.stock, data.stockBySize)}`);
    continue;
  }
  console.log(
    `${slug}  (${model}): ${describeStock(data.stock, data.stockBySize)} -> ` +
      `${describeStock(next.stock, next.stockBySize)}  ${apply ? 'WRITE' : 'WOULD WRITE'}`,
  );
  if (apply) {
    try {
      // Checked against the stock it had, not the update time: the colour-siblings trigger rewrites
      // these products right after part 1 creates their new colours.
      await db.runTransaction(async (tx) => {
        const live = await tx.get(snap.ref);
        const now = live.data() ?? {};
        const same =
          live.exists &&
          now.stock === data.stock &&
          (isMap(now.stockBySize) ? stableJson(now.stockBySize) : 'none') ===
            (isMap(data.stockBySize) ? stableJson(data.stockBySize) : 'none');
        if (!same) throw new Error(RACED);
        tx.update(snap.ref, {
          stock: next.stock,
          inStock: next.inStock,
          stockBySize: next.stockBySize ?? FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: UPDATED_BY,
        });
      });
    } catch (error) {
      if (error.message === RACED) {
        raced += 1;
        console.log('  SKIP: its stock changed while the script ran; run again');
      } else {
        failed.push(`${slug}: ${error.message}`);
        console.log(`  FAILED: ${error.message}`);
      }
      continue;
    }
  }
  setToFive += 1;
}
if (leftAlone.length > 0) {
  console.log('\nKept (real counts, not the placeholder):');
  for (const line of leftAlone) console.log(`  ${line}`);
}

if (failed.length > 0) {
  console.log('\nFailed (not a race; read the error):');
  for (const line of failed) console.log(`  ${line}`);
}

if (checks.length > 0) {
  console.log('\nNot split:');
  for (const line of checks) console.log(line);
}

const verb = apply ? '' : 'would be ';
console.log(
  `\nProducts ${verb}split: ${split} (left as CHECK: ${splitChecks}).` +
    `\nColours ${verb}created: ${coloursCreated}.` +
    `\nProducts ${verb}set to ${START_STOCK}: ${setToFive} (already ${START_STOCK}: ${alreadyFive}).` +
    `\nProducts left alone (real counts): ${leftAlone.length}.` +
    `${apply ? `\nChanged meanwhile: ${raced}. Failed: ${failed.length}.` : ''}` +
    (apply ? '\nNow run Catalogue Tools -> Rebuild search.' : '\nDry run only; add --apply to write.'),
);
